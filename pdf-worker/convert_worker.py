"""
LIIMS PDF Conversion Worker

Runs natively on Windows (outside Docker) and watches a shared folder
for .docx files from the LIMS backend, converting them to PDF using
Microsoft Word COM automation.

Architecture:
  LIMS backend (Docker) → writes .docx + request.json to shared volume
  This worker (Windows)  → converts docx→pdf via MS Word → writes done.flag
  LIMS backend (Docker) → reads PDFs, serves to user

Setup:
  pip install pywin32
  python convert_worker.py

The shared folder is mounted as a Docker volume at ./data/pdf-worker
"""

import json
import time
import sys
from pathlib import Path

try:
    import pythoncom
    import win32com.client
except ImportError:
    print("ERROR: pywin32 is required. Install with: pip install pywin32")
    sys.exit(1)

WATCH_FOLDER = Path(__file__).parent.parent / "data" / "pdf-worker"
WATCH_FOLDER.mkdir(parents=True, exist_ok=True)


def convert_batch(request_file: Path) -> None:
    """Convert all .docx files listed in a request to PDF."""
    data = json.loads(request_file.read_text())
    request_id = data["request_id"]
    docx_files = data["files"]

    print(f"\n{'='*50}")
    print(f"Request {request_id}: converting {len(docx_files)} files...")

    # Remove the request file to signal we've picked it up
    request_file.unlink()

    request_dir = WATCH_FOLDER / request_id
    if not request_dir.exists():
        print(f"  ERROR: Request directory {request_dir} not found")
        return

    # Start Word
    pythoncom.CoInitialize()
    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    word.DisplayAlerts = 0

    try:
        results = []
        for docx_name in docx_files:
            docx_path = request_dir / docx_name
            pdf_path = docx_path.with_suffix(".pdf")

            if not docx_path.exists():
                print(f"  SKIP {docx_name} (not found)")
                results.append({"file": docx_name, "status": "not_found"})
                continue

            print(f"  Converting {docx_name}...", end=" ", flush=True)
            converted = False
            for attempt in range(3):
                try:
                    time.sleep(0.5)
                    doc = word.Documents.Open(str(docx_path.resolve()))
                    doc.ExportAsFixedFormat(str(pdf_path.resolve()), 17, False)
                    doc.Close(0)
                    docx_path.unlink()  # Remove docx after successful conversion
                    size = pdf_path.stat().st_size
                    print(f"OK ({size:,} bytes)")
                    results.append({
                        "file": docx_name.replace(".docx", ".pdf"),
                        "status": "ok",
                        "size": size,
                    })
                    converted = True
                    break
                except Exception as e:
                    print(f"attempt {attempt+1} failed: {e}")
                    try:
                        doc.Close(0)
                    except Exception:
                        pass
                    time.sleep(2)

            if not converted:
                print(f"  FAILED: {docx_name}")
                results.append({"file": docx_name, "status": "failed"})

        # Write completion signal
        done_data = {"request_id": request_id, "results": results}
        (request_dir / "done.json").write_text(json.dumps(done_data))
        print(f"Done! Request {request_id} complete.")

    finally:
        try:
            word.Quit()
        except Exception:
            pass
        pythoncom.CoUninitialize()

    print(f"{'='*50}\n")


def main():
    print("=" * 60)
    print("  LIIMS PDF Conversion Worker")
    print("  Using Microsoft Word for high-quality PDF output")
    print("=" * 60)
    print(f"Watching: {WATCH_FOLDER}")
    print("Press Ctrl+C to stop\n")

    while True:
        try:
            # Look for request files
            for req_file in WATCH_FOLDER.glob("*.request.json"):
                try:
                    convert_batch(req_file)
                except Exception as e:
                    print(f"Error processing {req_file.name}: {e}")
                    req_file.unlink(missing_ok=True)
        except KeyboardInterrupt:
            print("\nShutting down...")
            break
        except Exception as e:
            print(f"Unexpected error: {e}")

        time.sleep(1)


if __name__ == "__main__":
    main()
