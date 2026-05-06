from pymongo import MongoClient
c = MongoClient("mongodb://localhost:27017")
s = c.eurovision.command("collstats", "tweets")
mb = lambda b: f"{b/1024/1024:,.1f} MB"
print(f"docs:        {s['count']:,}")
print(f"data size:   {mb(s['size'])}")
print(f"storage:     {mb(s['storageSize'])}  (compressed on disk)")
print(f"indexes:     {mb(s['totalIndexSize'])}")
print(f"total disk:  {mb(s['storageSize'] + s['totalIndexSize'])}")
