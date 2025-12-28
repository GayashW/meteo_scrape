import requests
import pandas as pd
from bs4 import BeautifulSoup
from datetime import datetime
import os

# --- CONFIGURATION ---
URL = "http://www.meteo.gov.lk/index.php?option=com_content&view=article&id=103&Itemid=310&lang=en"
OUTPUT_DIR = "docs"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "data.xlsx")

# Headers to mimic a real browser (prevents blocking)
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
}

def scrape_weather():
    print(f"Fetching data from {URL}...")
    try:
        response = requests.get(URL, headers=HEADERS, timeout=15)
        response.raise_for_status()
    except Exception as e:
        print(f"Error fetching page: {e}")
        return

    soup = BeautifulSoup(response.content, "html.parser")
    
    # Find the data table
    table = soup.find("table")
    if not table:
        print("No table found on the webpage.")
        return

    # Parse table using Pandas
    try:
        dfs = pd.read_html(str(table))
        df = dfs[0]
    except Exception as e:
        print(f"Error parsing table: {e}")
        return

    # --- CLEANING & RENAMING ---
    # The Met Dept table headers often change slightly, so we standardize them.
    # We rename columns to match what your script.js expects.
    
    # Standardize column names based on position (safer than name matching)
    # Assumes standard Met Dept layout: ID, Name, Date, Rain, TotRain, Temp, RH, Type
    if len(df.columns) >= 8:
        df.columns = [
            'Station_ID', 
            'Station_Name', 
            'Report_Time', 
            'Rainfall (mm)', 
            'Tot RF since 830am', 
            'Temperature ( C )', 
            'RH (%)', 
            'weathertype'
        ]
    else:
        print("Table structure changed! Columns found:", df.columns)
        return

    # Clean numeric columns (force numeric, coerce errors to NaN)
    df['Temperature ( C )'] = pd.to_numeric(df['Temperature ( C )'], errors='coerce')
    df['Rainfall (mm)'] = pd.to_numeric(df['Rainfall (mm)'], errors='coerce')

    # Ensure Report_Time is a string format your JS can parse
    # JS expects "YYYY-MM-DD HHMM" or similar. 
    # Usually the website gives it clean, but let's ensure it's treated as string.
    df['Report_Time'] = df['Report_Time'].astype(str)

    # --- MERGING WITH HISTORY ---
    # We want to keep past data so the slider works.
    
    # 1. Load existing data if it exists
    if os.path.exists(OUTPUT_FILE):
        try:
            old_df = pd.read_excel(OUTPUT_FILE)
            print(f"Loaded {len(old_df)} existing records.")
            
            # Combine old and new
            combined_df = pd.concat([old_df, df])
            
            # Remove duplicates based on Station and Time
            # (We keep the 'last' one which is the newest scrape)
            combined_df.drop_duplicates(subset=['Station_Name', 'Report_Time'], keep='last', inplace=True)
            
            # Sort by time
            combined_df.sort_values(by='Report_Time', ascending=True, inplace=True)
            
        except Exception as e:
            print(f"Could not read existing file, starting fresh. Error: {e}")
            combined_df = df
    else:
        print("No existing data file found. Creating new one.")
        combined_df = df

    # --- SAVING ---
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    combined_df.to_excel(OUTPUT_FILE, index=False)
    print(f"Successfully saved {len(combined_df)} records to {OUTPUT_FILE}")

if __name__ == "__main__":
    scrape_weather()