import math

import bpy

from geometry import (
    add_box,
    add_curve_pipe,
    add_cylinder,
    add_railing,
    add_truss,
    assign_material,
    create_group,
    create_material,
    move_to_collection,
    parent_to,
)


COLORS = {
    "soil": (0.10, 0.12, 0.11),
    "concrete": (0.42, 0.44, 0.43),
    "concreteLight": (0.55, 0.56, 0.54),
    "asphalt": (0.105, 0.115, 0.12),
    "roadMarking": (0.82, 0.69, 0.24),
    "steel": (0.29, 0.33, 0.35),
    "steelDark": (0.16, 0.19, 0.20),
    "roof": (0.25, 0.28, 0.27),
    "glass": (0.075, 0.13, 0.15),
    "door": (0.20, 0.22, 0.21),
    "waterPipe": (0.12, 0.40, 0.58),
    "sludgePipe": (0.35, 0.25, 0.17),
    "airPipe": (0.67, 0.67, 0.62),
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
    for index, (x, y, width, depth) in enumerate((
        (25.0, -45.0, 77.0, 44.0),
        (117.0, -9.0, 73.0, 61.0),
        (174.0, -45.0, 47.0, 38.0),
        (238.0, -45.0, 92.0, 46.0),
        (106.0, 25.0, 86.0, 29.0),
        (86.0, 59.0, 115.0, 38.0),
        (115.0, -84.0, 110.0, 42.0),
    )):
        _adopt(add_box(
            f"SitePads.{index:02d}",
            (width, depth, 0.18),
            (x, y, 0.06),
            0.08,
            materials["concrete"],
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
    positions = {
        item["tag"]: (item["position"][0], -item["position"][2])
        for item in spec["equipment"]
    }

    tags = [tag for tag in spec["mainFlowTags"] if tag in positions]
    for index, (start_tag, end_tag) in enumerate(zip(tags, tags[1:])):
        sx, sy = positions[start_tag]
        ex, ey = positions[end_tag]
        height = 1.25 + (index % 3) * 0.18
        points = (
            (sx, sy, height),
            ((sx + ex) / 2, sy - 2.2, height + 0.12),
            ((sx + ex) / 2, ey - 2.2, height + 0.12),
            (ex, ey, height),
        )
        pipe = add_curve_pipe(
            f"ProcessPipes.Main.{index:02d}.{start_tag}.{end_tag}",
            points,
            0.13,
            materials["waterPipe"],
        )
        move_to_collection(pipe, collection)
        parent_to(pipe, root)
        for support_index, support_x in enumerate((0.33, 0.67)):
            support_y = sy + (ey - sy) * support_index
            support = add_box(
                f"ProcessPipes.Support.{index:02d}.{support_index:02d}",
                (0.16, 0.16, height),
                (sx + (ex - sx) * support_x, support_y - 2.2, height / 2),
                0.02,
                materials["steelDark"],
            )
            move_to_collection(support, collection)
            parent_to(support, root)

    for index, route in enumerate(spec["returnFlows"]):
        if route["from"] not in positions or route["to"] not in positions:
            continue
        sx, sy = positions[route["from"]]
        ex, ey = positions[route["to"]]
        material = materials.get(route["material"], materials["sludgePipe"])
        height = 0.85 + index * 0.12
        pipe = add_curve_pipe(
            f"ProcessPipes.Return.{route['id']}",
            ((sx, sy, height), ((sx + ex) / 2, sy + 2.2, height), (ex, ey, height)),
            0.105,
            material,
        )
        move_to_collection(pipe, collection)
        parent_to(pipe, root)

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
