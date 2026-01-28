#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

NODES_FILE="/opt/nginx-gui/nodes.json"
if [ ! -f "$NODES_FILE" ]; then echo "nodes file not found: $NODES_FILE"; exit 1; fi

python3 - <<'PY'
import json
p='''"""
"""'''
with open('/opt/nginx-gui/nodes.json') as f:
    nodes=json.load(f)
seen=set()
out=[]
for n in nodes:
    h=n.get('host')
    if h in seen: continue
    seen.add(h)
    out.append(n)
open('/opt/nginx-gui/nodes.json','w').write(json.dumps(out,indent=2))
print('deduped',len(nodes),'->',len(out))
PY
