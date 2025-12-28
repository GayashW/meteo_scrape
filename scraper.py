import requests
import pandas as pd
from pathlib import Path
from datetime import datetime
import shutil
import sys
import os

# --- CONFIGURATION ---
SOURCE_URL = "https://meteo.gov.lk/excels/3hourly.xlsx"
DATA_DIR = Path("docs")
MASTER_FILE = DATA_DIR / "data.xlsx"
ARCHIVE_DIR = Path("archive")
MAX_ARCHIVE_PER_DAY = 30 

# Ensure folders exist
DATA_DIR.mkdir(parents=True, exist_ok=True)
ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)

def list_files(directory):
    """Helper to print files in a directory for debugging."""
    try:
        files = list(directory.glob("*"))
        print(f"DEBUG: Contents of {directory}: {[f.name for f in files]}")
    except Exception as e:
        print(f"DEBUG: Could not list {directory}: {e}")

def download_file(path: Path):
    print(f"Downloading from {SOURCE_URL}...")
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        r = requests.get(SOURCE_URL, headers=headers, timeout=60)
        r.raise_for_status()
        with open(path, "wb") as f:
            f.write(r.content)
        print(f"SUCCESS: Downloaded file ({os.path.getsize(path)} bytes)")
    except Exception as e:
        print(f"CRITICAL ERROR: Download failed: {e}")
        sys.exit(1)

def cleanup_archives(day_folder: Path):
    archives = sorted(day_folder.glob("*.xlsx"))
    if len(archives) > MAX_ARCHIVE_PER_DAY:
        print(f"Cleaning old archives in {day_folder.name}...")
        for old_file in archives[:-MAX_ARCHIVE_PER_DAY]:
            old_file.unlink()

def main():
    print(f"DEBUG: Current working directory: {os.getcwd()}")
    temp_file = Path("temp_download.xlsx")
    
    # 1. DOWNLOAD
    download_file(temp_file)

    try:
        # 2. ARCHIVE
        new_df = pd.read_excel(temp_file)
        
        try:
            if 'Report_Time' in new_df.columns:
                first_val = str(new_df['Report_Time'].iloc[0])
                sample_date = first_val.split(' ')[0]
            else:
                sample_date = datetime.utcnow().strftime("%Y-%m-%d")
        except:
            sample_date = datetime.utcnow().strftime("%Y-%m-%d")

        day_folder = ARCHIVE_DIR / sample_date
        day_folder.mkdir(parents=True, exist_ok=True)
        
        timestamp = datetime.utcnow().strftime("%H%M")
        archive_name = day_folder / f"{timestamp}.xlsx"
        
        shutil.copy2(temp_file, archive_name)
        
        # DEBUG: Verify archive creation
        if archive_name.exists():
            print(f"SUCCESS: Created archive at {archive_name}")
            list_files(day_folder) # List files to prove it's there
        else:
            print(f"ERROR: Failed to create archive file at {archive_name}")

        cleanup_archives(day_folder)

        # 3. MERGE MASTER
        if 'Report_Time' in new_df.columns:
            new_df['Report_Time'] = new_df['Report_Time'].astype(str).str.strip()
        
        if MASTER_FILE.exists():
            print(f"DEBUG: Found existing master file. Size: {os.path.getsize(MASTER_FILE)} bytes")
            master_df = pd.read_excel(MASTER_FILE)
            if 'Report_Time' in master_df.columns:
                master_df['Report_Time'] = master_df['Report_Time'].astype(str).str.strip()
        else:
            print("DEBUG: No master file found. Creating new one.")
            master_df = pd.DataFrame()

        if not master_df.empty:
            combined_df = pd.concat([master_df, new_df])
            combined_df.drop_duplicates(subset=['Station_Name', 'Report_Time'], keep='last', inplace=True)
            
            if len(combined_df) == len(master_df):
                print("DEBUG: No new unique records. Master file will remain unchanged.")
            else:
                print(f"DEBUG: Adding {len(combined_df) - len(master_df)} new records.")
        else:
            combined_df = new_df

        # 4. SAVE MASTER
        if 'Report_Time' in combined_df.columns:
            combined_df.sort_values(by='Report_Time', inplace=True)
            
        combined_df.to_excel(MASTER_FILE, index=False)
        
        # DEBUG: Verify master file
        if MASTER_FILE.exists():
            print(f"SUCCESS: Master file saved at {MASTER_FILE} ({os.path.getsize(MASTER_FILE)} bytes)")
        else:
            print(f"ERROR: Master file was NOT saved at {MASTER_FILE}")

    except Exception as e:
        print(f"CRITICAL ERROR in processing: {e}")
        sys.exit(1)
    finally:
        if temp_file.exists():
            temp_file.unlink()

if __name__ == "__main__":
    main()
