import requests
import pandas as pd
from pathlib import Path
from datetime import datetime
import shutil
import sys
import os

# --- CONFIG ---
SOURCE_URL = "https://meteo.gov.lk/excels/3hourly.xlsx"
DATA_DIR = Path("docs")
MASTER_FILE = DATA_DIR / "data.xlsx"  # The combined history file
ARCHIVE_DIR = Path("archive")         # Raw snapshots
MAX_ARCHIVE_PER_DAY = 30 

# Ensure directories exist
DATA_DIR.mkdir(parents=True, exist_ok=True)
ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)

def download_file(path: Path):
    print(f"Downloading from {SOURCE_URL}...")
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        r = requests.get(SOURCE_URL, headers=headers, timeout=60)
        r.raise_for_status()
        with open(path, "wb") as f:
            f.write(r.content)
        print("Download successful.")
    except Exception as e:
        print(f"Download Error: {e}")
        sys.exit(1)

def cleanup_archives(day_folder: Path):
    archives = sorted(day_folder.glob("*.xlsx"))
    if len(archives) > MAX_ARCHIVE_PER_DAY:
        print(f"Cleaning old archives in {day_folder.name}...")
        for old_file in archives[:-MAX_ARCHIVE_PER_DAY]:
            old_file.unlink()

def main():
    temp_file = Path("temp_download.xlsx")
    
    # 1. Download the latest 3-hour snapshot
    download_file(temp_file)

    try:
        # 2. Read the new snapshot
        new_df = pd.read_excel(temp_file)
        
        # Standardize columns (ensure time is string for matching)
        if 'Report_Time' in new_df.columns:
            new_df['Report_Time'] = new_df['Report_Time'].astype(str).str.strip()
        
        # 3. Load the existing Master File (History)
        if MASTER_FILE.exists():
            master_df = pd.read_excel(MASTER_FILE)
            if 'Report_Time' in master_df.columns:
                master_df['Report_Time'] = master_df['Report_Time'].astype(str).str.strip()
        else:
            print("No master file found. Creating new one.")
            master_df = pd.DataFrame()

        # 4. COMPARE CONTENT: Check for New Data
        # We assume data is "new" if the combination of (Station + Time) is not in master
        if not master_df.empty:
            # Combine Old + New
            combined_df = pd.concat([master_df, new_df])
            
            # Check size before deduplication
            len_before = len(combined_df)
            
            # Remove Duplicates
            # We keep 'last' (the new one) to ensure we have the freshest version
            combined_df.drop_duplicates(subset=['Station_Name', 'Report_Time'], keep='last', inplace=True)
            
            len_after = len(combined_df)
            
            # If length didn't change after adding new_df, then new_df was fully duplicate
            # CAUTION: We must compare len_after vs len(master_df) 
            if len(combined_df) == len(master_df):
                print("Content Check: Identical to existing data. Skipping update.")
                temp_file.unlink()
                sys.exit(0)
            else:
                print(f"Content Check: Found {len(combined_df) - len(master_df)} new records!")
        else:
            combined_df = new_df
            print("Initial setup: Using downloaded file as master.")

        # 5. SAVE UPDATES
        
        # A) Update Master (Combined)
        # Sort by time so the slider works nicely
        if 'Report_Time' in combined_df.columns:
            combined_df.sort_values(by='Report_Time', inplace=True)
            
        combined_df.to_excel(MASTER_FILE, index=False)
        print(f"Updated Master File: {MASTER_FILE}")

        # B) Archive the Snapshot (Only if it was new data)
        # Determine date from the data itself, or fallback to today
        try:
            sample_date = new_df['Report_Time'].iloc[0].split(' ')[0] # "2025-12-29"
        except:
            sample_date = datetime.utcnow().strftime("%Y-%m-%d")

        day_folder = ARCHIVE_DIR / sample_date
        day_folder.mkdir(parents=True, exist_ok=True)
        
        timestamp = datetime.utcnow().strftime("%H%M")
        archive_name = day_folder / f"{timestamp}.xlsx"
        
        # Move the raw download to archive
        shutil.move(temp_file, archive_name)
        print(f"Archived snapshot to: {archive_name}")
        
        cleanup_archives(day_folder)

    except Exception as e:
        print(f"Processing Error: {e}")
        if temp_file.exists():
            temp_file.unlink()
        sys.exit(1)

if __name__ == "__main__":
    main()
