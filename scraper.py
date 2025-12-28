import requests
import pandas as pd
from pathlib import Path
from datetime import datetime
import shutil
import sys
import os
import hashlib

# --- CONFIGURATION ---
SOURCE_URL = "https://meteo.gov.lk/excels/3hourly.xlsx"
DATA_DIR = Path("docs")
MASTER_FILE = DATA_DIR / "data.xlsx"
ARCHIVE_DIR = Path("archive")
MAX_ARCHIVE_PER_DAY = 30 

# Ensure folders exist
DATA_DIR.mkdir(parents=True, exist_ok=True)
ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)

def get_file_hash(file_path):
    """Calculates the SHA256 hash of a file to check for exact duplicates."""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        # Read the file in chunks
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()

def download_file(path: Path):
    print(f"Action: Downloading from {SOURCE_URL}...")
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        r = requests.get(SOURCE_URL, headers=headers, timeout=60)
        r.raise_for_status()
        with open(path, "wb") as f:
            f.write(r.content)
        print("Result: Download successful.")
    except Exception as e:
        print(f"CRITICAL FAILURE: Download Error: {e}")
        sys.exit(1)

def cleanup_archives(day_folder: Path):
    archives = sorted(day_folder.glob("*.xlsx"))
    count = len(archives)
    if count > MAX_ARCHIVE_PER_DAY:
        print(f"Cleanup: Removing {count - MAX_ARCHIVE_PER_DAY} old files.")
        for old_file in archives[:-MAX_ARCHIVE_PER_DAY]:
            old_file.unlink()
    return count

def main():
    # --- REPORT VARS ---
    status_archive = "Skipped (Duplicate)"
    status_master = "No Change"
    rows_added = 0
    archive_path = "None"
    
    temp_file = Path("temp_download.xlsx")
    
    # 1. DOWNLOAD
    download_file(temp_file)

    try:
        # 2. CHECK & ARCHIVE
        # Determine the target date folder
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
        
        # --- THE FIX: HASH CHECK ---
        should_archive = True
        
        # Find the most recent file in today's archive
        existing_archives = sorted(day_folder.glob("*.xlsx"))
        
        if existing_archives:
            last_archive = existing_archives[-1] # Get the last one added
            
            # Calculate hashes
            new_hash = get_file_hash(temp_file)
            last_hash = get_file_hash(last_archive)
            
            if new_hash == last_hash:
                print(f"Duplicate Check: File matches {last_archive.name}. Skipping archive.")
                should_archive = False
            else:
                print("Duplicate Check: Content is different. Proceeding.")
        
        # Save to Archive if unique
        if should_archive:
            timestamp = datetime.utcnow().strftime("%H%M")
            archive_name = day_folder / f"{timestamp}.xlsx"
            shutil.copy2(temp_file, archive_name)
            
            status_archive = "Success"
            archive_path = str(archive_name)
        
        file_count = cleanup_archives(day_folder)

        # 3. MERGE MASTER (Standard Logic)
        if 'Report_Time' in new_df.columns:
            new_df['Report_Time'] = new_df['Report_Time'].astype(str).str.strip()
        
        master_rows_start = 0
        if MASTER_FILE.exists():
            master_df = pd.read_excel(MASTER_FILE)
            master_rows_start = len(master_df)
            if 'Report_Time' in master_df.columns:
                master_df['Report_Time'] = master_df['Report_Time'].astype(str).str.strip()
        else:
            master_df = pd.DataFrame()

        if not master_df.empty:
            combined_df = pd.concat([master_df, new_df])
            combined_df.drop_duplicates(subset=['Station_Name', 'Report_Time'], keep='last', inplace=True)
            
            rows_after = len(combined_df)
            rows_added = rows_after - master_rows_start
            
            if rows_added > 0:
                status_master = "Updated"
            else:
                status_master = "Identical Data"
        else:
            combined_df = new_df
            rows_added = len(new_df)
            status_master = "Created New"

        if 'Report_Time' in combined_df.columns:
            combined_df.sort_values(by='Report_Time', inplace=True)
            
        combined_df.to_excel(MASTER_FILE, index=False)

    except Exception as e:
        print(f"CRITICAL ERROR: {e}")
        sys.exit(1)
    finally:
        if temp_file.exists():
            temp_file.unlink()

    # --- FINAL MISSION REPORT ---
    print("\n" + "="*40)
    print("      SCRAPER MISSION REPORT      ")
    print("="*40)
    print(f"1. Archive Status : {status_archive}")
    print(f"   -> Saved to    : {archive_path}")
    print("-" * 40)
    print(f"2. Master Status  : {status_master}")
    print(f"   -> New Rows    : {rows_added} added")
    print("="*40 + "\n")

if __name__ == "__main__":
    main()
