import argparse
import importlib.util
import json
import sys
from pathlib import Path

import bpy

sys.dont_write_bytecode = True
tools_directory = Path(__file__).parent
sys.path.insert(0, str(tools_directory))
from export import BLENDER_VERSION, export_glb, prepare_scene
from equipment import build_equipment, create_equipment_materials

site_spec = importlib.util.spec_from_file_location(
    "ice3_wastewater_site",
    tools_directory / "site.py",
)
site_module = importlib.util.module_from_spec(site_spec)
sys.modules[site_spec.name] = site_module
site_spec.loader.exec_module(site_module)
build_process_pipes = site_module.build_process_pipes
build_site = site_module.build_site


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
build_site(spec["assetId"])
build_process_pipes(spec)

equipment_materials = create_equipment_materials()
for item in spec["equipment"]:
    obj = build_equipment(item, equipment_materials)
    obj["ice3"] = {
        "selectionId": f'{spec["assetId"]}/equipment/{item["tag"]}',
        "equipmentTag": item["tag"],
        "processStage": item["stage"],
        "displayName": item["name"],
    }

export_glb(args.output)
