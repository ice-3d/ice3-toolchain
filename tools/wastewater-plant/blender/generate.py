import argparse
import json
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).parent))
from export import BLENDER_VERSION, export_glb, prepare_scene


parser = argparse.ArgumentParser()
parser.add_argument("--spec", required=True)
parser.add_argument("--output", required=True)
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])

if tuple(bpy.app.version[:3]) != BLENDER_VERSION:
    raise RuntimeError(
        f"ICE3_WWTP_BLENDER_VERSION_INVALID: {bpy.app.version_string}"
    )

spec = json.loads(Path(args.spec).read_text(encoding="utf-8"))
prepare_scene(spec["assetId"])

for item in spec["equipment"]:
    bpy.ops.mesh.primitive_cube_add(
        size=1,
        location=(item["position"][0], -item["position"][2], item["position"][1]),
    )
    obj = bpy.context.object
    obj.name = item["tag"]
    obj["ice3"] = {
        "selectionId": f'{spec["assetId"]}/equipment/{item["tag"]}',
        "equipmentTag": item["tag"],
        "processStage": item["stage"],
        "displayName": item["name"],
    }

export_glb(args.output)
