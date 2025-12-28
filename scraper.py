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
MASTER_FILE = DATA_DIR / "data.xlsx"  # The file used by the website
ARCHIVE_DIR = Path("archive")         # The folder for history backups
MAX_ARCHIVE_PER_DAY = 30              # Safety limit to keep folders clean

# Ensure folders exist
DATA_DIR.mkdir(parents=True, exist_ok=True)
ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)

def download_file(path: Path):
    """Downloads the Excel file from the Met Dept."""
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
    """Deletes old files if there are more than 30 in one day."""
    archives = sorted(day_folder.glob("*.xlsx"))
    if len(archives) > MAX_ARCHIVE_PER_DAY:
        print(f"Cleaning old archives in {day_folder.name}...")
        for old_file in archives[:-MAX_ARCHIVE_PER_DAY]:
            old_file.unlink()

def main():
    temp_file = Path("temp_download.xlsx")
    
    # 1. DOWNLOAD
    download_file(temp_file)

    try:
        # 2. ARCHIVE (Do this FIRST so we never miss a file)
        new_df = pd.read_excel(temp_file)
        
        # Get the date from the data (or use today's date if that fails)
        try:
            if 'Report_Time' in new_df.columns:
                first_val = str(new_df['Report_Time'].iloc[0])
                sample_date = first_val.split(' ')[0] # Extract "2025-12-29"
            else:
                sample_date = datetime.utcnow().strftime("%Y-%m-%d")
        except:
            sample_date = datetime.utcnow().strftime("%Y-%m-%d")

        # Create folder: archive/2025-12-29/
        day_folder = ARCHIVE_DIR / sample_date
        day_folder.mkdir(parents=True, exist_ok=True)
        
        # Save as: archive/2025-12-29/0830.xlsx
        timestamp = datetime.utcnow().strftime("%H%M")
        archive_name = day_folder / f"{timestamp}.xlsx"
        
        shutil.copy2(temp_file, archive_name)
        print(f"Archived snapshot to: {archive_name}")
        cleanup_archives(day_folder)

        # 3. MERGE WITH MASTER FILE (For the Website)
        # Standardize time format to string for accurate comparison
        if 'Report_Time' in new_df.columns:
            new_df['Report_Time'] = new_df['Report_Time'].astype(str).str.strip()
        
        if MASTER_FILE.exists():
            master_df = pd.read_excel(MASTER_FILE)
            if 'Report_Time' in master_df.columns:
                master_df['Report_Time'] = master_df['Report_Time'].astype(str).str.strip()
        else:
            print("No master file found. Creating new one.")
            master_df = pd.DataFrame()

        # Combine old data + new data
        if not master_df.empty:
            combined_df = pd.concat([master_df, new_df])
            
            # THE SMART PART: Remove Duplicates
            # If "Colombo 08:30" is in both files, keep only the newest one.
            combined_df.drop_duplicates(subset=['Station_Name', 'Report_Time'], keep='last', inplace=True)
            
            # Check if we actually added anything new
            if len(combined_df) == len(master_df):
                print("Master File Check: No new unique records found.")
            else:
                print(f"Master File Check: Added {len(combined_df) - len(master_df)} new records.")
        else:
            combined_df = new_df

        # 4. SAVE MASTER
        if 'Report_Time' in combined_df.columns:
            combined_df.sort_values(by='Report_Time', inplace=True)
            
        combined_df.to_excel(MASTER_FILE, index=False)
        print(f"Updated Master File: {MASTER_FILE}")

    except Exception as e:
        print(f"Processing Error: {e}")
        sys.exit(1)
    finally:
        # Clean up the temp file from the root folder
        if temp_file.exists():
            temp_file.unlink()

if __name__ == "__main__":
    main()
