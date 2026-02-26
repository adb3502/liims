"""
Request PDF generation from the worker process
"""
from pathlib import Path
import json
import time
from typing import List

OUTPUT_FOLDER = Path(__file__).parent / "output"


def generate_pdfs(codes: List[str], date_str: str = "") -> List[Path]:
    """
    Request PDFs from the worker process.
    Writes codes.json and waits for done.flag
    """
    OUTPUT_FOLDER.mkdir(exist_ok=True)

    # Clear old PDFs
    for f in OUTPUT_FOLDER.glob("*.pdf"):
        f.unlink()

    # Remove old done flag
    done_flag = OUTPUT_FOLDER / "done.flag"
    done_flag.unlink(missing_ok=True)

    # Write request
    codes_file = OUTPUT_FOLDER / "codes.json"
    codes_file.write_text(json.dumps({"codes": codes, "date": date_str}))
    print(f"Request written: {len(codes)} codes")

    # Wait for worker to finish (up to 5 minutes)
    print("Waiting for worker...")
    for i in range(300):
        if done_flag.exists():
            done_flag.unlink()
            print("Worker finished!")
            break
        time.sleep(1)
        if i % 10 == 0 and i > 0:
            print(f"  Still waiting... ({i}s)")
    else:
        print("Timeout waiting for worker!")
        return []

    # Return PDFs
    pdfs = list(OUTPUT_FOLDER.glob("*.pdf"))
    print(f"Found {len(pdfs)} PDFs")
    return pdfs
