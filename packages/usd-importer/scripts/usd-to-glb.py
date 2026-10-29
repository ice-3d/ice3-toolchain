#!/usr/bin/env python3

import argparse
import json
import math
import os
import sys
import tempfile

import bpy
from pxr import Usd


OMITTED = object()


def parse_args():
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


def stage_properties(stage):
    result = {}
    for prim in stage.TraverseAll():
        properties = {}
        for prop in prim.GetAuthoredProperties():
            name = prop.GetName()
            if not name.startswith("userProperties:"):
                continue
            key = name.split(":", 1)[1]
            parsed = safe_value(prop.Get())
            if parsed is not OMITTED:
                properties[key] = parsed
        result[prim.GetName()] = {
            "usdPrimPath": str(prim.GetPath()),
            "customProperties": properties,
            "instanceable": prim.IsInstanceable(),
            "referencePath": referenced_path(prim),
        }
    return result


def referenced_path(prim):
    references = prim.GetMetadata("references")
    if references:
        for item in (
            list(references.prependedItems)
            + list(references.appendedItems)
            + list(references.explicitItems)
        ):
            if item.primPath:
                return item.primPath
    stack = prim.GetPrimStack()
    return stack[1].path if len(stack) > 1 else None


def materialize_instances(stage):
    for prim in stage.TraverseAll():
        if not prim.IsInstanceable() or not prim.GetName():
            continue
        target = bpy.data.objects.get(prim.GetName())
        reference_path = referenced_path(prim)
        if (
            target is None
            or target.type != "EMPTY"
            or reference_path is None
        ):
            continue
        source = bpy.data.objects.get(reference_path.name)
        if source is None or source.type != "MESH":
            continue
        collection = (
            target.users_collection[0]
            if target.users_collection
            else bpy.context.scene.collection
        )
        matrix = target.matrix_world.copy()
        parent = target.parent
        required_properties = {
            key: target[key] for key in target.keys()
            if key != "_RNA_UI"
        }
        bpy.data.objects.remove(target, do_unlink=True)
        duplicate = source.copy()
        duplicate.data = source.data
        duplicate.name = prim.GetName()
        collection.objects.link(duplicate)
        duplicate.parent = parent
        duplicate.matrix_world = matrix
        for key, value in required_properties.items():
            duplicate[key] = value


def apply_stage_properties(properties):
    for name, metadata in properties.items():
        obj = bpy.data.objects.get(name)
        if obj is None:
            continue
        for key, value in metadata["customProperties"].items():
            obj[key] = value


def object_report(obj, properties):
    vertex_count = 0
    triangle_count = 0
    mesh_data = None
    if obj.type == "MESH" and obj.data is not None:
        mesh_data = obj.data.name
        vertex_count = len(obj.data.vertices)
        obj.data.calc_loop_triangles()
        triangle_count = len(obj.data.loop_triangles)
    metadata = properties.get(obj.name, {})
    custom = {}
    for key in sorted(obj.keys()):
        if key == "_RNA_UI" or key.startswith("cycles."):
            continue
        parsed = safe_value(obj[key])
        if parsed is not OMITTED:
            custom[key] = parsed
    custom.update(metadata.get("customProperties", {}))
    return {
        "name": obj.name,
        "objectType": obj.type,
        **({"parentName": obj.parent.name} if obj.parent else {}),
        **({"meshData": mesh_data} if mesh_data else {}),
        **(
            {"usdPrimPath": metadata["usdPrimPath"]}
            if metadata.get("usdPrimPath")
            else {}
        ),
        "vertexCount": vertex_count,
        "triangleCount": triangle_count,
        "customProperties": custom,
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
        stage = Usd.Stage.Open(args.input)
        if stage is None:
            fail(args.report, args.output, "ICE3_TOOL_USD_IMPORT_FAILED")
        properties = stage_properties(stage)
        bpy.ops.wm.read_factory_settings(use_empty=True)
        import_result = bpy.ops.wm.usd_import(
            filepath=args.input,
            scale=1.0,
            set_frame_range=False,
            import_cameras=False,
            import_curves=False,
            import_lights=False,
            import_materials=True,
            import_meshes=True,
            import_volumes=False,
            import_shapes=False,
            import_skeletons=False,
            import_blendshapes=False,
            import_points=False,
            import_subdivision=False,
            support_scene_instancing=True,
            import_visible_only=False,
            create_collection=False,
            read_mesh_uvs=False,
            read_mesh_colors=True,
            read_mesh_attributes=True,
            import_guide=False,
            import_proxy=True,
            import_render=False,
            import_textures_mode="IMPORT_NONE",
            property_import_mode="ALL",
            validate_meshes=True,
            import_defined_only=True,
            merge_parent_xform=False,
            apply_unit_conversion_scale=True,
        )
        if "FINISHED" not in import_result:
            fail(args.report, args.output, "ICE3_TOOL_USD_IMPORT_FAILED")
        materialize_instances(stage)
        apply_stage_properties(properties)
        supported = sorted(
            (
                obj
                for obj in bpy.context.scene.objects
                if obj.type in {"MESH", "EMPTY"}
            ),
            key=lambda item: item.name,
        )
        objects = [object_report(obj, properties) for obj in supported]
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
            fail(args.report, args.output, "ICE3_TOOL_USD_EXPORT_FAILED")
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
        fail(args.report, args.output, "ICE3_TOOL_USD_IMPORT_FAILED")


if __name__ == "__main__":
    main()
