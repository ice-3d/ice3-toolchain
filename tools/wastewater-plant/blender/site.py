import math

import bpy
from mathutils import Vector

from geometry import (
    add_box,
    add_cylinder,
    add_pipe_segment,
    add_railing,
    add_sphere,
    add_stairs,
    add_truss,
    assign_material,
    create_group,
    create_material,
    join_parts,
    move_to_collection,
    parent_to,
)


COLORS = {
    "soil": (0.055, 0.070, 0.085),
    "concrete": (0.40, 0.43, 0.43),
    "concreteLight": (0.53, 0.55, 0.53),
    "concreteWarm": (0.47, 0.38, 0.31),
    "concreteCool": (0.31, 0.42, 0.46),
    "concreteBlue": (0.37, 0.44, 0.51),
    "asphalt": (0.12, 0.14, 0.16),
    "roadMarking": (0.95, 0.67, 0.10),
    "steel": (0.22, 0.35, 0.44),
    "steelDark": (0.08, 0.13, 0.16),
    "roof": (0.20, 0.27, 0.31),
    "glass": (0.04, 0.20, 0.25),
    "door": (0.22, 0.26, 0.27),
    "waterPipe": (0.10, 0.48, 0.82),
    "sludgePipe": (0.72, 0.40, 0.16),
    "airPipe": (0.63, 0.72, 0.72),
    "mixedLiquorPipe": (0.10, 0.62, 0.48),
    "chemicalPipe": (0.95, 0.68, 0.08),
    "biogasPipe": (0.58, 0.72, 0.12),
    "backwashPipe": (0.08, 0.58, 0.66),
    "filtratePipe": (0.50, 0.34, 0.70),
    "treatedPipe": (0.06, 0.58, 0.88),
    "safety": (0.87, 0.52, 0.08),
}


def _materials():
    return {
        key: create_material(f"Site.{key}", color)
        for key, color in COLORS.items()
    }


def _adopt(obj, collection, parent):
    move_to_collection(obj, collection)
    parent_to(obj, parent)
    return obj


def _building(
    group,
    collection,
    materials,
    name,
    center,
    size,
    annex=False,
):
    width, depth, height = size
    x, y = center
    concrete = materials["concrete"]
    light = materials["concreteLight"]
    roof = materials["roof"]
    glass = materials["glass"]

    _adopt(add_box(
        f"{name}.Slab",
        (width + 0.8, depth + 0.8, 0.35),
        (x, y, 0.17),
        0.08,
        concrete,
    ), collection, group)
    _adopt(add_box(
        f"{name}.Wall.Rear",
        (width, 0.24, height),
        (x, y + depth / 2, height / 2 + 0.28),
        0.03,
        light,
    ), collection, group)
    _adopt(add_box(
        f"{name}.Wall.Left",
        (0.24, depth, height),
        (x - width / 2, y, height / 2 + 0.28),
        0.03,
        light,
    ), collection, group)
    _adopt(add_box(
        f"{name}.Wall.Right",
        (0.24, depth, height),
        (x + width / 2, y, height / 2 + 0.28),
        0.03,
        light,
    ), collection, group)

    door_width = min(3.4, width * 0.22)
    side_width = (width - door_width) / 2
    for suffix, offset in (("L", -1), ("R", 1)):
        _adopt(add_box(
            f"{name}.Wall.Front.{suffix}",
            (side_width, 0.24, height),
            (x + offset * (width - side_width) / 2, y - depth / 2, height / 2 + 0.28),
            0.03,
            light,
        ), collection, group)
    _adopt(add_box(
        f"{name}.Wall.Front.Lintel",
        (door_width, 0.24, max(0.8, height - 3.4)),
        (x, y - depth / 2, 3.4 + max(0.8, height - 3.4) / 2),
        0.02,
        light,
    ), collection, group)
    _adopt(add_box(
        f"{name}.Door",
        (door_width - 0.2, 0.08, 3.2),
        (x, y - depth / 2 - 0.16, 1.85),
        0.02,
        materials["door"],
    ), collection, group)
    _adopt(add_box(
        f"{name}.Canopy",
        (door_width + 2.0, 2.2, 0.18),
        (x, y - depth / 2 - 0.85, 3.65),
        0.05,
        roof,
    ), collection, group)

    window_z = max(2.2, height * 0.62)
    window_count = max(2, int(width / 3.2))
    for index in range(window_count):
        wx = x - width * 0.36 + width * 0.72 * index / max(window_count - 1, 1)
        if abs(wx - x) < door_width:
            continue
        _adopt(add_box(
            f"{name}.Window.Front.{index:02d}",
            (1.35, 0.07, 1.05),
            (wx, y - depth / 2 - 0.15, window_z),
            0.02,
            glass,
        ), collection, group)
    side_window_count = max(2, int(depth / 3.4))
    for side, sx in (("L", x - width / 2 - 0.15), ("R", x + width / 2 + 0.15)):
        for index in range(side_window_count):
            wy = y - depth * 0.34 + depth * 0.68 * index / max(side_window_count - 1, 1)
            _adopt(add_box(
                f"{name}.Window.{side}.{index:02d}",
                (0.07, 1.2, 1.0),
                (sx, wy, window_z),
                0.02,
                glass,
            ), collection, group)

    _adopt(add_box(
        f"{name}.Roof",
        (width + 0.9, depth + 0.9, 0.34),
        (x, y, height + 0.39),
        0.07,
        roof,
    ), collection, group)
    vent_count = 2 if not annex else 1
    for index in range(vent_count):
        vx = x - width * 0.22 + width * 0.44 * index
        _adopt(add_cylinder(
            f"{name}.RoofVent.{index:02d}",
            0.38,
            0.75,
            (vx, y + depth * 0.12, height + 0.92),
            24,
            0.035,
            materials["steel"],
        ), collection, group)
    _adopt(add_box(
        f"{name}.RoofCap",
        (width * 0.46, 0.12, 0.54),
        (x, y - depth * 0.23, height + 0.88),
        0.02,
        materials["steelDark"],
    ), collection, group)
    for index in range(max(2, int(width / 4))):
        rib_x = x - width * 0.4 + width * 0.8 * index / max(
            int(width / 4) - 1,
            1,
        )
        _adopt(add_box(
            f"{name}.RoofRib.{index:02d}",
            (0.10, depth + 0.5, 0.12),
            (rib_x, y, height + 0.61),
            0.015,
            roof,
        ), collection, group)
    for side, sy in (("N", y + depth / 2 - 0.2), ("S", y - depth / 2 + 0.2)):
        _adopt(add_box(
            f"{name}.Parapet.{side}",
            (width + 0.8, 0.12, 0.48),
            (x, sy, height + 0.77),
            0.02,
            light,
        ), collection, group)
    _adopt(add_stairs(
        f"{name}.ExternalStairs",
        (x + width * 0.32, y - depth / 2 - 1.5),
        1.25,
        max(2.4, height * 0.75),
        height,
        max(8, int(height / 0.24)),
        materials["safety"],
        direction=1.0,
        z_base=0.28,
    ), collection, group)


def build_site(asset_id):
    collection = bpy.data.collections.new("SiteGeometry")
    bpy.context.scene.collection.children.link(collection)
    materials = _materials()
    site = create_group("Site", collection)
    site["ice3"] = {"assetId": asset_id, "role": "site"}

    ground = create_group("Ground", collection, site)
    _adopt(add_box(
        "Ground.Slab",
        (318.0, 180.0, 0.30),
        (135.0, -22.0, -0.15),
        0.16,
        materials["soil"],
    ), collection, ground)
    site_pad = create_group("SitePads", collection, ground)
    for index, (x, y, width, depth, material_key) in enumerate((
        (25.0, -45.0, 77.0, 44.0, "concreteWarm"),
        (117.0, -9.0, 73.0, 61.0, "concreteCool"),
        (174.0, -45.0, 47.0, 38.0, "concreteBlue"),
        (238.0, -45.0, 92.0, 46.0, "concreteBlue"),
        (106.0, 25.0, 86.0, 29.0, "concrete"),
        (86.0, 59.0, 115.0, 38.0, "concrete"),
        (115.0, -84.0, 110.0, 42.0, "concreteWarm"),
    )):
        _adopt(add_box(
            f"SitePads.{index:02d}",
            (width, depth, 0.18),
            (x, y, 0.06),
            0.08,
            materials[material_key],
        ), collection, site_pad)

    roads = create_group("RoadNetwork", collection, site)
    road_specs = (
        ("MainAccess", (132.0, -11.0, 286.0, 10.0)),
        ("NorthService", (132.0, 26.0, 286.0, 7.0)),
        ("SouthService", (132.0, -57.0, 286.0, 7.0)),
        ("WestConnector", (22.0, 5.0, 8.0, 123.0)),
        ("EastConnector", (288.0, 5.0, 8.0, 123.0)),
        ("SludgeAccess", (91.0, -72.0, 104.0, 8.0)),
    )
    for index, (name, (x, y, width, depth)) in enumerate(road_specs):
        road = _adopt(add_box(
            f"RoadNetwork.{name}",
            (width, depth, 0.09),
            (x, y, 0.10),
            0.03,
            materials["asphalt"],
        ), collection, roads)
        if name not in ("WestConnector", "EastConnector"):
            for side, offset in (("N", depth / 2), ("S", -depth / 2)):
                _adopt(add_box(
                    f"RoadNetwork.{name}.Curb.{side}",
                    (width, 0.25, 0.18),
                    (x, y + offset, 0.14),
                    0.025,
                    materials["concreteLight"],
                ), collection, roads)
            marking_count = max(3, int(width / 12))
            for mark in range(marking_count):
                mx = x - width / 2 + (mark + 0.5) * width / marking_count
                _adopt(add_box(
                    f"RoadNetwork.{name}.Marking.{mark:02d}",
                    (3.2, 0.10, 0.015),
                    (mx, y, 0.16),
                    0.0,
                    materials["roadMarking"],
                ), collection, roads)
    for index, (x, y) in enumerate((
        (22.0, -11.0), (132.0, -11.0), (242.0, -11.0),
        (22.0, 26.0), (132.0, 26.0), (242.0, 26.0),
        (22.0, -57.0), (132.0, -57.0), (242.0, -57.0),
    )):
        _adopt(add_cylinder(
            f"RoadNetwork.StormDrain.{index:02d}",
            0.38,
            0.04,
            (x, y, 0.17),
            20,
            0.01,
            materials["steelDark"],
        ), collection, roads)

    perimeter = create_group("Perimeter", collection, site)
    sides = (
        ("North", (-18.0, 68.0), (288.0, 68.0)),
        ("South", (-18.0, -112.0), (288.0, -112.0)),
        ("West", (-18.0, -112.0), (-18.0, 62.0)),
        ("East", (288.0, -112.0), (288.0, 62.0)),
    )
    for side_name, start, end in sides:
        side_group = create_group(f"Perimeter.{side_name}", collection, perimeter)
        dx = end[0] - start[0]
        dy = end[1] - start[1]
        length = math.hypot(dx, dy)
        count = max(2, int(length / 10.0))
        for index in range(count):
            t0 = index / count
            t1 = (index + 1) / count
            x0 = start[0] + dx * t0
            y0 = start[1] + dy * t0
            x1 = start[0] + dx * t1
            y1 = start[1] + dy * t1
            _adopt(add_box(
                f"Perimeter.{side_name}.Panel.{index:02d}",
                (max(abs(x1 - x0), 0.05), max(abs(y1 - y0), 0.05), 1.8),
                ((x0 + x1) / 2, (y0 + y1) / 2, 0.9),
                0.015,
                materials["steel"],
            ), collection, side_group)
            if index % 2 == 0:
                _adopt(add_cylinder(
                    f"Perimeter.{side_name}.Post.{index:02d}",
                    0.075,
                    2.0,
                    (x1, y1, 1.0),
                    10,
                    0.006,
                    materials["steelDark"],
                ), collection, side_group)

    buildings = create_group("Buildings", collection, site)
    building_specs = (
        ("Headworks", (18.0, -67.0), (26.0, 15.0, 8.0), False),
        ("ChemicalDosing", (57.0, 38.0), (35.0, 17.0, 7.0), False),
        ("Blower", (137.0, 39.0), (31.0, 16.0, 8.5), False),
        ("Dewatering", (128.0, 55.0), (34.0, 19.0, 9.0), False),
        ("Administration", (28.0, -17.0), (31.0, 16.0, 9.5), True),
    )
    for name, center, size, annex in building_specs:
        group = create_group(f"{name}Building", collection, buildings)
        _building(group, collection, materials, name, center, size, annex)

    pipe_racks = create_group("PipeRacks", collection, site)
    rack_paths = (
        ((4.0, -20.0), (68.0, -20.0)),
        ((75.0, 33.0), (164.0, 33.0)),
        ((167.0, 49.0), (259.0, 49.0)),
        ((97.0, 32.0), (152.0, 32.0)),
    )
    for rack_index, (start, end) in enumerate(rack_paths):
        dx = end[0] - start[0]
        dy = end[1] - start[1]
        count = max(2, int(math.hypot(dx, dy) / 8.0))
        for index in range(count):
            t = index / (count - 1)
            x = start[0] + dx * t
            y = start[1] + dy * t
            _adopt(add_box(
                f"PipeRacks.{rack_index:02d}.Post.{index:02d}.L",
                (0.18, 0.18, 3.6),
                (x, y - 1.1, 1.8),
                0.025,
                materials["steelDark"],
            ), collection, pipe_racks)
            _adopt(add_box(
                f"PipeRacks.{rack_index:02d}.Post.{index:02d}.R",
                (0.18, 0.18, 3.6),
                (x, y + 1.1, 1.8),
                0.025,
                materials["steelDark"],
            ), collection, pipe_racks)
            _adopt(add_box(
                f"PipeRacks.{rack_index:02d}.Beam.{index:02d}",
                (0.18, 2.5, 0.18),
                (x, y, 3.6),
                0.02,
                materials["steel"],
            ), collection, pipe_racks)

    utilities = create_group("SiteUtilities", collection, site)
    for index, (x, y, height, radius) in enumerate((
        (12.0, -42.0, 12.0, 0.65),
        (43.0, -45.0, 8.0, 0.48),
        (116.0, 24.0, 10.0, 0.55),
        (164.0, 28.0, 8.0, 0.50),
        (273.0, -35.0, 7.0, 0.45),
    )):
        _adopt(add_cylinder(
            f"SiteUtilities.Tank.{index:02d}",
            radius,
            height,
            (x, y, height / 2),
            28,
            0.04,
            materials["steel"],
        ), collection, utilities)
    for index, (x, y) in enumerate((
        (12.0, -24.0), (60.0, -28.0), (111.0, -28.0),
        (181.0, -28.0), (256.0, -28.0), (282.0, 27.0),
    )):
        _adopt(add_box(
            f"SiteUtilities.Lamp.{index:02d}.Pole",
            (0.13, 0.13, 7.0),
            (x, y, 3.5),
            0.015,
            materials["steelDark"],
        ), collection, utilities)
        _adopt(add_box(
            f"SiteUtilities.Lamp.{index:02d}.Head",
            (1.1, 0.38, 0.16),
            (x, y - 0.3, 7.0),
            0.04,
            materials["safety"],
        ), collection, utilities)
    _adopt(add_railing(
        "SiteMaintenanceWalkway.Rail",
        (-5.0, -18.0),
        (69.0, -18.0),
        1.05,
        materials["safety"],
        0.25,
    ), collection, utilities)

    return collection


def build_process_pipes(spec):
    collection = bpy.data.collections.new("ProcessPipeGeometry")
    bpy.context.scene.collection.children.link(collection)
    materials = _materials()
    root = bpy.data.objects.get("ProcessPipes")
    if root is None:
        root = create_group("ProcessPipes", collection)
    ports = {
        f"{item['tag']}:{port['id']}": port
        for item in spec["equipment"]
        for port in item["ports"]
    }
    material_by_medium = {
        "wastewater": materials["waterPipe"],
        "primaryEffluent": materials["waterPipe"],
        "mixedLiquor": materials["mixedLiquorPipe"],
        "secondaryEffluent": materials["waterPipe"],
        "returnActivatedSludge": materials["sludgePipe"],
        "wasteActivatedSludge": materials["sludgePipe"],
        "sludge": materials["sludgePipe"],
        "filtrate": materials["filtratePipe"],
        "chemical": materials["chemicalPipe"],
        "air": materials["airPipe"],
        "biogas": materials["biogasPipe"],
        "backwash": materials["backwashPipe"],
        "treatedEffluent": materials["treatedPipe"],
        "utilityWater": materials["waterPipe"],
    }

    def to_blender(position):
        return Vector((position[0], -position[2], position[1]))

    def direction_to_blender(direction):
        vector = Vector((direction[0], -direction[2], direction[1]))
        return vector.normalized() if vector.length > 0.0001 else Vector((1, 0, 0))

    for index, route in enumerate(spec["connections"]):
        start_port = ports[route["from"]]
        end_port = ports[route["to"]]
        start = to_blender(start_port["position"])
        end = to_blender(end_port["position"])
        start_direction = direction_to_blender(start_port["direction"])
        end_direction = direction_to_blender(end_port["direction"])
        radius = max(0.045, route["diameter"] / 2)
        route_points = [to_blender(point) for point in route["routePoints"]]
        material = material_by_medium[route["medium"]]
        pipe_parts = []
        for segment_index, (segment_start, segment_end) in enumerate(
            zip(route_points, route_points[1:]),
        ):
            segment = add_pipe_segment(
                f"Pipe.{route['id']}.Segment.{segment_index:02d}",
                tuple(segment_start),
                tuple(segment_end),
                radius,
                material,
                20,
            )
            if segment is not None:
                pipe_parts.append(segment)
        pipe_metadata = {
            "assetId": spec["assetId"],
            "role": "process-pipe",
            "connectionId": route["id"],
            "from": route["from"],
            "to": route["to"],
            "medium": route["medium"],
            "diameter": route["diameter"],
        }
        for elbow_index, point in enumerate(route_points[1:-1], start=1):
            pipe_parts.append(add_sphere(
                f"Pipe.{route['id']}.Elbow.{elbow_index}",
                radius * 1.12,
                tuple(point),
                material_by_medium[route["medium"]],
                16,
                8,
            ))
        for endpoint_name, endpoint, direction in (
            ("Start", start, start_direction),
            ("End", end, end_direction),
        ):
            orientation = Vector((0, 0, 1)).rotation_difference(direction).to_euler()
            pipe_parts.append(add_cylinder(
                f"Pipe.{route['id']}.{endpoint_name}.Flange",
                max(radius * 1.65, 0.09),
                0.12,
                tuple(endpoint),
                24,
                0.006,
                materials["steelDark"],
                orientation,
            ))
        if len(pipe_parts) == 0:
            raise RuntimeError(f"empty pipe route: {route['id']}")
        joined_pipe = join_parts(pipe_parts, f"Pipe.{route['id']}")
        joined_pipe["ice3"] = pipe_metadata
        move_to_collection(joined_pipe, collection)
        parent_to(joined_pipe, root)
        if route["layout"] == "rack":
            for segment_index, (segment_start, segment_end) in enumerate(
                zip(route_points, route_points[1:]),
            ):
                horizontal = (
                    abs(segment_start.z - segment_end.z) < 0.01
                    and (segment_end.xy - segment_start.xy).length > 6
                )
                if not horizontal:
                    continue
                support_x = (segment_start.x + segment_end.x) / 2
                support_y = (segment_start.y + segment_end.y) / 2
                support = add_box(
                    f"Pipe.{route['id']}.Support.{segment_index:02d}",
                    (0.18, 0.18, segment_start.z),
                    (support_x, support_y, segment_start.z / 2),
                    0.02,
                    materials["steelDark"],
                )
                move_to_collection(support, collection)
                parent_to(support, root)

    _adopt(add_truss(
        "PipeRacks.MainCrossover",
        (72.0, -21.0),
        (158.0, -21.0),
        4.0,
        2.3,
        0.75,
        materials["steel"],
    ), collection, root)
    return collection
