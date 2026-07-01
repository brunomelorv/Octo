import json
import os
import subprocess

transcript_path = r"C:\Users\BrunoPereiradeMeloAr\.gemini\antigravity-cli\brain\c661d563-cf05-46ca-b1a0-f09296a47250\.system_generated\logs\transcript_full.jsonl"
print(f"Reading transcript: {transcript_path}")

target_time = "2026-06-30T17:36:28Z"

edits = []

with open(transcript_path, "r", encoding="utf-8") as f:
    for line_idx, line in enumerate(f):
        if not line.strip():
            continue
        try:
            step = json.loads(line)
            created_at = step.get("created_at", "")
            if created_at > target_time:
                break
                
            tool_calls = step.get("tool_calls", [])
            for tc in tool_calls:
                name = tc.get("name")
                args = tc.get("args", {})
                if name in ["replace_file_content", "multi_replace_file_content", "write_to_file"]:
                    edits.append({
                        "step_index": step.get("step_index", line_idx),
                        "type": name,
                        "args": args,
                        "time": created_at
                    })
        except Exception as e:
            print(f"Error parsing line {line_idx}: {e}")

print(f"Found {len(edits)} code edits before {target_time}.")

def clean_arg(val):
    if isinstance(val, str):
        try:
            # The args values are JSON-encoded strings, so we decode them to get the actual string
            return json.loads(val)
        except:
            pass
    return val

# Reset to base commit
os.chdir(r"C:\Users\BrunoPereiradeMeloAr\Desktop\lead-analytics")
subprocess.run(["git", "stash"], check=False)
subprocess.run(["git", "reset", "--hard", "8565eed"], check=True)
print("Git reset to 8565eed completed.")

# Apply edits forward
for edit in edits:
    step_idx = edit["step_index"]
    etype = edit["type"]
    args = edit["args"]
    time_str = edit["time"]
    
    target_file = clean_arg(args.get("TargetFile"))
    if not target_file:
        continue
        
    print(f"\n--- Applying edit from Step {step_idx} ({time_str}) on: {target_file} ---")
    
    os.makedirs(os.path.dirname(target_file), exist_ok=True)
    
    if etype == "write_to_file":
        content = clean_arg(args.get("CodeContent", ""))
        with open(target_file, "w", encoding="utf-8") as f:
            f.write(content)
        print("Wrote new file.")
        continue
    
    if not os.path.exists(target_file):
        print(f"Warning: File {target_file} does not exist for {etype}. Creating it empty.")
        with open(target_file, "w", encoding="utf-8") as f:
            f.write("")
            
    with open(target_file, "r", encoding="utf-8") as f:
        content = f.read()
        
    if etype == "replace_file_content":
        target = clean_arg(args.get("TargetContent", ""))
        replacement = clean_arg(args.get("ReplacementContent", ""))
        
        if target in content:
            content = content.replace(target, replacement, 1)
            with open(target_file, "w", encoding="utf-8") as f:
                f.write(content)
            print(f"Successfully applied replacement in {target_file}")
        else:
            print(f"Warning: Target content not found in {target_file}. Attempting fallback...")
            target_norm = target.replace("\r\n", "\n")
            content_norm = content.replace("\r\n", "\n")
            if target_norm in content_norm:
                content_norm = content_norm.replace(target_norm, replacement.replace("\r\n", "\n"), 1)
                with open(target_file, "w", encoding="utf-8") as f:
                    f.write(content_norm)
                print("Fallback successful.")
            else:
                print("Fallback failed.")
            
    elif etype == "multi_replace_file_content":
        # ReplacementChunks is usually a JSON string containing a list of dicts!
        chunks_raw = args.get("ReplacementChunks", "[]")
        chunks = clean_arg(chunks_raw)
        if isinstance(chunks, str):
            try:
                chunks = json.loads(chunks)
            except:
                chunks = []
                
        for chunk in chunks:
            target = chunk.get("TargetContent", "")
            replacement = chunk.get("ReplacementContent", "")
            
            if target in content:
                content = content.replace(target, replacement, 1)
                with open(target_file, "w", encoding="utf-8") as f:
                    f.write(content)
                print(f"Successfully applied multi-replacement chunk in {target_file}")
            else:
                print(f"Warning: Chunk target content not found in {target_file}.")
                target_norm = target.replace("\r\n", "\n")
                content_norm = content.replace("\r\n", "\n")
                if target_norm in content_norm:
                    content_norm = content_norm.replace(target_norm, replacement.replace("\r\n", "\n"), 1)
                    with open(target_file, "w", encoding="utf-8") as f:
                        f.write(content_norm)
                    content = content_norm
                    print("Fallback successful.")
                else:
                    print("Fallback failed.")

print("\nReplay finished.")
