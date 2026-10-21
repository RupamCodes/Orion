#!/usr/bin/env python3
"""
Orion Dataset Preprocessor
Formats raw QA and dialogue datasets into Alpaca / LLaMA-3 ChatML JSONL format.
"""
import os
import json
import argparse

def format_squad_to_chatml(input_file: str, output_file: str):
    print(f"[*] Converting {input_file} to Orion ChatML format: {output_file}")
    formatted = []
    
    with open(input_file, "r") as f:
        for line in f:
            if not line.strip():
                continue
            try:
                item = json.loads(line)
            except Exception:
                continue
                
            context = item.get("context", "")
            question = item.get("question", "")
            answers = item.get("answers", {}).get("text", [])
            
            if not answers or not context or not question:
                continue
                
            answer_text = answers[0]
            
            # Format as grounded RAG instruction
            prompt = f"<|start_header_id|>system<|end_header_id|>\nYou are Orion. Answer the question using only the provided context and cite it with [1].<|eot_id|><|start_header_id|>user<|end_header_id|>\nContext: [1] {context}\n\nQuestion: {question}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\nBased on the source document [1], {answer_text}.<|eot_id|>"
            
            formatted.append({"text": prompt})
            
    with open(output_file, "w") as f:
        for entry in formatted:
            f.write(json.dumps(entry) + "\n")
            
    print(f"[✓] Formatted {len(formatted)} instruction samples into {output_file}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input_file", default="./training/data/squad_train.json")
    parser.add_argument("--output_file", default="./training/data/orion_train.jsonl")
    args = parser.parse_args()
    
    if os.path.exists(args.input_file):
        format_squad_to_chatml(args.input_file, args.output_file)
    else:
        print(f"Input file {args.input_file} not found. Run download_kaggle_data.py first.")
