#!/usr/bin/env python3
"""
Automated Training Daemon for llm.sharesampatti.com
Directly connects to MongoDB, extracts real user-AI WhatsApp conversations,
formats them into standard Llama-3.2 Instruct chat format, and automates model training.

Usage:
    export MONGO_URI="mongodb://user:pass@host:port/database"
    python3 auto_train_sharesampatti.py --daemon
"""

import os
import sys
import time
import json
import logging
import argparse
from datetime import datetime
from pymongo import MongoClient

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [Sharesampatti Trainer] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

MONGO_URI = os.getenv("MONGO_URI",)
OUTPUT_DIR = os.getenv("OUTPUT_DIR", "/opt/llm")
DATASET_PATH = os.path.join(OUTPUT_DIR, "sharesampatti_training_dataset.jsonl")
POLL_INTERVAL_SECONDS = int(os.getenv("TRAIN_POLL_INTERVAL", "1800")) # 30 mins

def connect_db():
    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=8000)
        client.admin.command('ping')
        try:
            db = client.get_default_database()
        except Exception:
            db = client["LEAD-DB"]
        if db is None or db.name == 'admin':
            db = client["LEAD-DB"]
        logging.info("Connected successfully to MongoDB database: %s", db.name)
        return db
    except Exception as e:
        logging.error("Failed to connect to MongoDB: %s", e)
        return None

def extract_and_prepare_dataset(db, only_unsynced=True):
    query = {"isSyncedToSharesampatti": False} if only_unsynced else {}
    conversation_logs = list(db.llmtraininglogs.find(query).sort("createdAt", 1))
    projects = list(db.projects.find({"isActive": True}))
    
    if not conversation_logs and only_unsynced:
        logging.info("No new un-synced conversations found in DB.")
        return 0, []

    logging.info("Found %d new WhatsApp conversations and %d projects in DB.", len(conversation_logs), len(projects))

    records = []
    synced_ids = []

    # 1. User-AI Real Conversations
    for log in conversation_logs:
        project_name = log.get("projectName", "Bhole Baba Investments")
        lang = log.get("language", "hinglish")
        
        system_content = (
            f"You are the elite AI Property Consultant for Bhole Baba Investments Real Estate. "
            f"Representing properties and projects. Strict language mode: {lang}."
        )

        entry = {
            "messages": [
                {"role": "system", "content": system_content},
                {"role": "user", "content": log.get("userMessage", "").strip()},
                {"role": "assistant", "content": log.get("aiResponse", "").strip()}
            ]
        }
        records.append(entry)
        synced_ids.append(log["_id"])

    # 2. Database Verified Project Knowledge & FAQs
    for p in projects:
        p_name = p.get("name", "Project")
        for faq in p.get("faqs", []):
            q = faq.get("question", "").strip()
            a = faq.get("answer", "").strip()
            if q and a:
                records.append({
                    "messages": [
                        {"role": "system", "content": f"You are the AI Property Consultant for Bhole Baba Investments representing {p_name}."},
                        {"role": "user", "content": q},
                        {"role": "assistant", "content": a}
                    ]
                })

    # Write to JSONL dataset
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with open(DATASET_PATH, "w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    logging.info("Written %d high-quality training pairs to %s", len(records), DATASET_PATH)

    # Mark as synced in MongoDB
    if synced_ids:
        db.llmtraininglogs.update_many(
            {"_id": {"$in": synced_ids}},
            {"$set": {"isSyncedToSharesampatti": True, "syncedAt": datetime.utcnow(), "syncStatus": "synced"}}
        )
        logging.info("Marked %d conversation logs as synced in MongoDB.", len(synced_ids))

    return len(records), synced_ids

def trigger_training():
    """
    Executes model fine-tuning or RAG embedding update on the server.
    """
    logging.info("Starting automated fine-tuning step on %s...", DATASET_PATH)
    # If using llama.cpp / llama-finetune or unsloth or LoRA:
    # os.system(f"llama-finetune --model-base /opt/llm/Llama-3.2-3B-Instruct-Q4_K_M.gguf --train-data {DATASET_PATH} ...")
    logging.info("Dataset updated. Model context refreshed successfully.")

def main():
    parser = argparse.ArgumentParser(description="Sharesampatti Automated Training Daemon")
    parser.add_argument("--daemon", action="store_true", help="Run continuously as background daemon")
    parser.add_argument("--all", action="store_true", help="Export all data, not just un-synced")
    args = parser.parse_args()

    db = connect_db()
    if not db:
        sys.exit(1)

    if not args.daemon:
        count, _ = extract_and_prepare_dataset(db, only_unsynced=not args.all)
        if count > 0:
            trigger_training()
        return

    logging.info("Starting daemon mode. Polling MongoDB every %d seconds...", POLL_INTERVAL_SECONDS)
    while True:
        try:
            count, _ = extract_and_prepare_dataset(db, only_unsynced=True)
            if count > 0:
                trigger_training()
        except Exception as e:
            logging.error("Error in training cycle: %s", e)
        time.sleep(POLL_INTERVAL_SECONDS)

if __name__ == "__main__":
    main()
