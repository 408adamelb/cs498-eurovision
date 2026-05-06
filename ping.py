from pymongo import MongoClient

client = MongoClient("mongodb://localhost:27017", serverSelectionTimeoutMS=3000)
info = client.server_info()
print("Connected. MongoDB version:", info["version"])
print("Databases:", client.list_database_names())
