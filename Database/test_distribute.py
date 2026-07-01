import sqlite3
import sys
import os

# Add the directory to sys.path so we can import build_database
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from build_database import distribute_new_leads

conn = sqlite3.connect('leads.db')
distribute_new_leads(conn)
conn.close()
