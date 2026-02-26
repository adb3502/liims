"""
PDF conversion worker - run this in a separate terminal
It watches for codes.json and converts when found
"""
import json
import time
from pathlib import Path
import pythoncom
import win32com.client

OUTPUT_FOLDER = Path(__file__).parent / "output"
OUTPUT_FOLDER.mkdir(exist_ok=True)

def convert():
    codes_file = OUTPUT_FOLDER / "codes.json"

    data = json.loads(codes_file.read_text())
    codes = data["codes"]
    date_str = data.get("date", "")

    # Remove the request file
    codes_file.unlink()

    print(f"\n{'='*50}")
    print(f"Generating labels for {len(codes)} codes...")

    # Clear old output
    for f in OUTPUT_FOLDER.glob("*.pdf"):
        f.unlink()
    for f in OUTPUT_FOLDER.glob("*.docx"):
        f.unlink()

    # Generate DOCX
    from label_generator import generate_labels_for_codes
    docx_files = generate_labels_for_codes(codes, OUTPUT_FOLDER, date_str)
    print(f"Created {len(docx_files)} DOCX files")

    # Convert to PDF
    pythoncom.CoInitialize()
    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    word.DisplayAlerts = 0
    print(f"Word {word.Version} started")

    for docx in docx_files:
        pdf = docx.with_suffix(".pdf")
        print(f"  Converting {docx.name}...", end=" ")
        converted = False
        for attempt in range(3):
            try:
                time.sleep(1)  # Give Word breathing room between files
                doc = word.Documents.Open(str(docx.resolve()))
                doc.ExportAsFixedFormat(str(pdf.resolve()), 17, False)
                doc.Close(0)
                docx.unlink()
                print(f"OK ({pdf.stat().st_size} bytes)")
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
            print(f"  FAILED after 3 attempts: {docx.name}")

    word.Quit()
    pythoncom.CoUninitialize()

    # Signal done
    (OUTPUT_FOLDER / "done.flag").write_text("done")
    print(f"Done! PDFs ready in {OUTPUT_FOLDER}")
    print(f"{'='*50}\n")


def main():
    print("="*50)
    print("  BHARAT Labels PDF Worker")
    print("="*50)
    print(f"Watching: {OUTPUT_FOLDER / 'codes.json'}")
    print("Waiting for requests from the web app...")
    print("Press Ctrl+C to stop\n")

    codes_file = OUTPUT_FOLDER / "codes.json"

    while True:
        if codes_file.exists():
            try:
                convert()
            except Exception as e:
                print(f"Error: {e}")
                # Clean up on error
                codes_file.unlink(missing_ok=True)
        time.sleep(1)


if __name__ == "__main__":
    main()
