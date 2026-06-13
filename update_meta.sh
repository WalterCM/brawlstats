#!/bin/bash
set -e

# Path to the virtual environment Python
PYTHON_BIN="/home/walter/Dev/brawlstats/backend/.venv/bin/python"

echo "============================================================"
echo "Starting Brawl Stats Meta Synchronization Pipeline"
echo "============================================================"

# Step 1: Run seed_catalog to update the list of brawlers and maps
echo -e "\n[Step 1] Seeding/updating catalog from official API..."
cd /home/walter/Dev/brawlstats/backend
$PYTHON_BIN manage.py seed_catalog

# Step 2: Run the scraper to get the latest competitive stats
echo -e "\n[Step 2] Scraping competitive stats from BrawlPlanet..."
cd /home/walter/Dev/brawlstats/scraper
$PYTHON_BIN scrape_brawlplanet.py

# Step 3: Sync the stats into the Django database
echo -e "\n[Step 3] Syncing meta stats to Django database..."
cd /home/walter/Dev/brawlstats/backend
$PYTHON_BIN manage.py sync_meta_stats

echo -e "\n============================================================"
echo "Pipeline Synchronization Completed Successfully!"
echo "============================================================"
