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
    "soil": (0.070, 0.090, 0.120),
    "concrete": (0.52, 0.53, 0.48),
    "concreteLight": (0.68, 0.69, 0.62),
    "concreteWarm": (0.58, 0.38, 0.18),
    "concreteCool": (0.16, 0.42, 0.31),
    "concreteBlue": (0.19, 0.32, 0.58),
    "asphalt": (0.025, 0.035, 0.055),
    "roadMarking": (1.00, 0.67, 0.04),
    "steel": (0.16, 0.38, 0.52),
    "steelDark": (0.025, 0.065, 0.080),
    "roof": (0.075, 0.14, 0.20),
    "glass": (0.02, 0.28, 0.42),
    "door": (0.64, 0.25, 0.035),
    "waterPipe": (0.015, 0.33, 0.85),
    "sludgePipe": (0.80, 0.22, 0.025),
    "airPipe": (0.68, 0.82, 0.88),
    "mixedLiquorPipe": (0.015, 0.55, 0.28),
    "chemicalPipe": (0.98, 0.68, 0.02),
    "biogasPipe": (0.52, 0.78, 0.03),
    "backwashPipe": (0.01, 0.58, 0.62),
    "filtratePipe": (0.48, 0.18, 0.78),
    "treatedPipe": (0.00, 0.56, 0.90),
    "safety": (0.95, 0.24, 0.01),
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

    door_width = min(4.2, width * 0.22)
    door_height = min(4.4, max(3.3, height * 0.32))
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
        (door_width, 0.24, max(0.8, height - door_height)),
        (x, y - depth / 2, door_height + max(0.8, height - door_height) / 2),
        0.02,
        light,
    ), collection, group)
    _adopt(add_box(
        f"{name}.Door",
        (door_width - 0.2, 0.08, door_height - 0.2),
        (x, y - depth / 2 - 0.16, door_height / 2 + 0.28),
        0.02,
        materials["door"],
    ), collection, group)
    _adopt(add_box(
        f"{name}.Canopy",
        (door_width + 2.0, 2.2, 0.18),
        (x, y - depth / 2 - 0.85, door_height + 0.55),
        0.05,
        roof,
    ), collection, group)

    window_z = max(2.8, height * 0.60)
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

    for index in range(max(4, int(width / 2.7))):
        rib_x = x - width * 0.45 + width * 0.9 * index / max(
            int(width / 2.7) - 1,
            1,
        )
        _adopt(add_box(
            f"{name}.FacadeRib.Front.{index:02d}",
            (0.13, 0.16, height * 0.82),
            (rib_x, y - depth / 2 - 0.16, height * 0.45 + 0.28),
            0.012,
            concrete,
        ), collection, group)
    _adopt(add_box(
        f"{name}.FacadeBand",
        (width + 0.08, 0.12, 0.62),
        (x, y - depth / 2 - 0.17, 0.70),
        0.015,
        concrete,
    ), collection, group)
    for side, sx in (("L", x - width / 2 - 0.17), ("R", x + width / 2 + 0.17)):
        for index in range(6):
            _adopt(add_box(
                f"{name}.Louver.{side}.{index:02d}",
                (0.10, 1.85, 0.10),
                (sx, y + depth * 0.18, height * 0.48 + index * 0.22),
                0.008,
                materials["steelDark"],
            ), collection, group)
    for side, sy in (
        ("Front", y - depth / 2 - 0.26),
        ("Rear", y + depth / 2 + 0.26),
    ):
        _adopt(add_cylinder(
            f"{name}.DoorFrame.{side}.L",
            0.10,
            door_height + 0.35,
            (x - door_width / 2, sy, (door_height + 0.35) / 2 + 0.22),
            12,
            0.012,
            materials["steelDark"],
        ), collection, group)
        _adopt(add_cylinder(
            f"{name}.DoorFrame.{side}.R",
            0.10,
            door_height + 0.35,
            (x + door_width / 2, sy, (door_height + 0.35) / 2 + 0.22),
            12,
            0.012,
            materials["steelDark"],
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
    monitor_width = width * 0.52
    monitor_depth = depth * 0.30
    _adopt(add_box(
        f"{name}.RoofMonitor",
        (monitor_width, monitor_depth, 0.95),
        (x, y + depth * 0.10, height + 1.02),
        0.06,
        light,
    ), collection, group)
    for side, sy in (
        ("N", y + depth * 0.10 + monitor_depth / 2 + 0.04),
        ("S", y + depth * 0.10 - monitor_depth / 2 - 0.04),
    ):
        _adopt(add_box(
            f"{name}.RoofMonitor.Glazing.{side}",
            (monitor_width * 0.86, 0.06, 0.42),
            (x, sy, height + 1.18),
            0.015,
            glass,
        ), collection, group)
    _adopt(add_box(
        f"{name}.RoofMonitor.Cap",
        (monitor_width + 0.35, monitor_depth + 0.35, 0.16),
        (x, y + depth * 0.10, height + 1.57),
        0.04,
        roof,
    ), collection, group)
    _adopt(add_box(
        f"{name}.RoofHatch",
        (1.35, 1.35, 0.24),
        (x - width * 0.28, y - depth * 0.22, height + 0.72),
        0.04,
        materials["steel"],
    ), collection, group)
    for suffix, sx, sy in (
        ("NW", x - width / 2 + 0.18, y + depth / 2 - 0.18),
        ("NE", x + width / 2 - 0.18, y + depth / 2 - 0.18),
        ("SW", x - width / 2 + 0.18, y - depth / 2 + 0.18),
        ("SE", x + width / 2 - 0.18, y - depth / 2 + 0.18),
    ):
        _adopt(add_cylinder(
            f"{name}.Downspout.{suffix}",
            0.09,
            height + 0.55,
            (sx, sy, (height + 0.55) / 2 + 0.25),
            12,
            0.01,
            materials["steelDark"],
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
        (x - max(2.4, height * 0.75) / 2, y - depth / 2 - 0.72),
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
        (135.0, -22.0, -0.40),
        0.16,
        materials["soil"],
    ), collection, ground)
    site_pad = create_group("SitePads", collection, ground)
    for index, (x, y, width, depth, material_key) in enumerate((
        (27.0, -43.5, 90.0, 43.0, "concreteWarm"),
        (113.5, -27.5, 83.0, 75.0, "concreteCool"),
        (222.0, -43.5, 134.0, 43.0, "concreteBlue"),
        (114.0, 19.0, 72.0, 18.0, "concrete"),
        (99.0, -88.5, 162.0, 47.0, "concreteWarm"),
    )):
        _adopt(add_box(
            f"SitePads.{index:02d}",
            (width, depth, 0.38),
            (x, y, -0.05),
            0.025,
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
            (width, depth, 0.05),
            (x, y, 0.20),
            0.012,
            materials["asphalt"],
        ), collection, roads)
        if name not in ("WestConnector", "EastConnector"):
            for side, offset in (("N", depth / 2), ("S", -depth / 2)):
                _adopt(add_box(
                    f"RoadNetwork.{name}.Curb.{side}",
                    (width, 0.25, 0.20),
                    (x, y + offset, 0.18),
                    0.025,
                    materials["concreteLight"],
                ), collection, roads)
            marking_count = max(3, int(width / 12))
            for mark in range(marking_count):
                mx = x - width / 2 + (mark + 0.5) * width / marking_count
                _adopt(add_box(
                    f"RoadNetwork.{name}.Marking.{mark:02d}",
                    (3.2, 0.10, 0.012),
                    (mx, y, 0.235),
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
            0.05,
            (x, y, 0.235),
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
        ("Headworks", (25.0, -84.0), (26.0, 15.0, 10.5), False),
        ("ChemicalDosing", (57.0, 38.0), (35.0, 17.0, 9.0), False),
        ("Blower", (137.0, 34.0), (31.0, 16.0, 11.5), False),
        ("Dewatering", (128.0, 60.0), (34.0, 19.0, 12.5), False),
        ("Administration", (28.0, -17.0), (31.0, 16.0, 12.0), True),
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
        # Extend into the two port collars so batching and simplification can
        # never expose a hairline gap at the equipment surface.
        route_points[0] -= start_direction * 0.35
        route_points[-1] -= end_direction * 0.35
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
        support_parts = []
        if route["layout"] != "buried":
            for segment_index, (segment_start, segment_end) in enumerate(
                zip(route_points, route_points[1:]),
            ):
                horizontal = (
                    abs(segment_start.z - segment_end.z) < 0.01
                    and (segment_end.xy - segment_start.xy).length > 6
                )
                if not horizontal:
                    continue
                length = (segment_end.xy - segment_start.xy).length
                support_count = max(1, math.ceil(length / 6.0))
                for support_index in range(support_count):
                    amount = (support_index + 0.5) / support_count
                    support_x = (
                        segment_start.x
                        + (segment_end.x - segment_start.x) * amount
                    )
                    support_y = (
                        segment_start.y
                        + (segment_end.y - segment_start.y) * amount
                    )
                    support_height = max(0.4, segment_start.z)
                    support_parts.append(add_box(
                        (
                            f"Pipe.{route['id']}.Support."
                            f"{segment_index:02d}.{support_index:02d}"
                        ),
                        (0.14, 0.14, support_height),
                        (support_x, support_y, support_height / 2),
                        0.0,
                        materials["steelDark"],
                    ))
        if support_parts:
            supports = join_parts(
                support_parts,
                f"Pipe.{route['id']}.Supports",
            )
            move_to_collection(supports, collection)
            parent_to(supports, root)

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
