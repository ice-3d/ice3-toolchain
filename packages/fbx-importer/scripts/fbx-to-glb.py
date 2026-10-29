#!/usr/bin/env python3

import argparse
import json
import math
import os
import sys
import tempfile

import bpy


OMITTED = object()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", required=True)
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1:])


def safe_value(value, depth=0):
    if depth > 8:
        return OMITTED
    if isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else OMITTED
    if isinstance(value, (list, tuple)):
        if len(value) > 256:
            return OMITTED
        result = []
        for item in value:
            parsed = safe_value(item, depth + 1)
            if parsed is not OMITTED:
                result.append(parsed)
        return result
    return OMITTED


def custom_properties(obj):
    result = {}
    for key in sorted(obj.keys()):
        if key == "_RNA_UI" or key.startswith("cycles."):
            continue
        parsed = safe_value(obj[key])
        if parsed is not OMITTED:
            result[key] = parsed
    return result


def object_report(obj):
    vertex_count = 0
    triangle_count = 0
    mesh_data = None
    if obj.type == "MESH" and obj.data is not None:
        mesh_data = obj.data.name
        vertex_count = len(obj.data.vertices)
        obj.data.calc_loop_triangles()
        triangle_count = len(obj.data.loop_triangles)
    return {
        "name": obj.name,
        "objectType": obj.type,
        **({"parentName": obj.parent.name} if obj.parent else {}),
        **({"meshData": mesh_data} if mesh_data else {}),
        "vertexCount": vertex_count,
        "triangleCount": triangle_count,
        "customProperties": custom_properties(obj),
    }


def write_json_atomic(path, value):
    directory = os.path.dirname(path) or "."
    os.makedirs(directory, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        dir=directory,
        delete=False,
    ) as temporary:
        json.dump(
            value,
            temporary,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        temporary.write("\n")
        temporary_path = temporary.name
    os.replace(temporary_path, path)


def fail(report_path, output_path, code):
    if os.path.exists(output_path):
        os.remove(output_path)
    write_json_atomic(report_path, {"success": False, "code": code})
    raise SystemExit(1)


def main():
    args = parse_args()
    try:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        result = bpy.ops.import_scene.fbx(
            filepath=args.input,
            use_manual_orientation=False,
            global_scale=1.0,
            bake_space_transform=False,
            use_custom_normals=True,
            use_image_search=False,
            use_alpha_decals=False,
            use_anim=False,
            use_subsurf=False,
            use_custom_props=True,
            use_custom_props_enum_as_string=True,
            ignore_leaf_bones=True,
            force_connect_children=False,
            automatic_bone_orientation=False,
            use_prepost_rot=True,
        )
        if "FINISHED" not in result:
            fail(args.report, args.output, "ICE3_TOOL_FBX_IMPORT_FAILED")

        supported = sorted(
            (
                obj
                for obj in bpy.context.scene.objects
                if obj.type in {"MESH", "EMPTY"}
            ),
            key=lambda item: (item.name, item.as_pointer()),
        )
        if not supported:
            fail(args.report, args.output, "ICE3_TOOL_FBX_IMPORT_FAILED")
        objects = [object_report(obj) for obj in supported]

        export_result = bpy.ops.export_scene.gltf(
            filepath=args.output,
            export_format="GLB",
            export_yup=True,
            export_apply=True,
            export_materials="EXPORT",
            export_normals=True,
            export_texcoords=False,
            export_cameras=False,
            export_lights=False,
            export_animations=False,
            export_skins=False,
            export_morph=False,
            export_extras=True,
            export_gpu_instances=False,
        )
        if "FINISHED" not in export_result:
            fail(args.report, args.output, "ICE3_TOOL_FBX_EXPORT_FAILED")

        version = ".".join(str(value) for value in bpy.app.version[:3])
        write_json_atomic(args.report, {
            "success": True,
            "converter": "blender",
            "toolVersion": version,
            "blenderVersion": version,
            "objects": objects,
        })
    except SystemExit:
        raise
    except Exception:
        fail(args.report, args.output, "ICE3_TOOL_FBX_IMPORT_FAILED")


if __name__ == "__main__":
    main()
