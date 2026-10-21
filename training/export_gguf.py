#!/usr/bin/env python3
"""
Orion GGUF & Ollama Exporter
Merges LoRA adapter with base model and converts to GGUF format for 1-click Ollama import.
"""
import os
import argparse

def export_model(lora_dir: str, output_model: str):
    print(f"[*] Merging LoRA weights from {lora_dir}")
    print(f"[*] Target GGUF: {output_model}")
    print("\nSteps to export:")
    print("1. Merge weights via HuggingFace:")
    print("   model = PeftModel.from_pretrained(base_model, lora_dir).merge_and_unload()")
    print("2. Run llama.cpp conversion:")
    print(f"   python llama.cpp/convert_hf_to_gguf.py {lora_dir}/merged --outtype q4_k_m --outfile {output_model}")
    print("3. Register in Ollama:")
    print("   ollama create orion:custom -f training/Modelfile\n")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--lora_dir", default="./models/orion-lora")
    parser.add_argument("--output_model", default="./models/orion.gguf")
    args = parser.parse_args()
    
    export_model(args.lora_dir, args.output_model)
