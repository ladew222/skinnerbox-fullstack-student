import sqlite3
file = "testdatabase.db"

try:
    conn = sqlite3.connect(file)
    print("database formed")
except:
    print("database not formed")