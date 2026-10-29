#!/usr/bin/env python3

import sys
from pathlib import Path

import ifcopenshell
import ifcopenshell.api
import ifcopenshell.guid


def create_model(length_unit: bool) -> ifcopenshell.file:
    model = ifcopenshell.api.run("project.create_file", version="IFC4X3")
    project = ifcopenshell.api.run(
        "root.create_entity",
        model,
        ifc_class="IfcProject",
        name="Synthetic IFC Plant",
    )
    site = ifcopenshell.api.run(
        "root.create_entity",
        model,
        ifc_class="IfcSite",
        name="Synthetic Site",
    )
    building = ifcopenshell.api.run(
        "root.create_entity",
        model,
        ifc_class="IfcBuilding",
        name="Treatment Building",
    )
    storey = ifcopenshell.api.run(
        "root.create_entity",
        model,
        ifc_class="IfcBuildingStorey",
        name="Process Floor",
    )
    ifcopenshell.api.run(
        "aggregate.assign_object",
        model,
        products=[site],
        relating_object=project,
    )
    ifcopenshell.api.run(
        "aggregate.assign_object",
        model,
        products=[building],
        relating_object=site,
    )
    ifcopenshell.api.run(
        "aggregate.assign_object",
        model,
        products=[storey],
        relating_object=building,
    )

    area_unit = ifcopenshell.api.run(
        "unit.add_si_unit",
        model,
        unit_type="AREAUNIT",
    )
    volume_unit = ifcopenshell.api.run(
        "unit.add_si_unit",
        model,
        unit_type="VOLUMEUNIT",
    )
    units = [area_unit, volume_unit]
    if length_unit:
        units.insert(
            0,
            ifcopenshell.api.run(
                "unit.add_si_unit",
                model,
                unit_type="LENGTHUNIT",
                prefix="MILLI",
            ),
        )
    ifcopenshell.api.run("unit.assign_unit", model, units=units)

    model_context = ifcopenshell.api.run(
        "context.add_context",
        model,
        context_type="Model",
    )
    body_context = ifcopenshell.api.run(
        "context.add_context",
        model,
        context_type="Model",
        context_identifier="Body",
        target_view="MODEL_VIEW",
        parent=model_context,
    )

    pump = ifcopenshell.api.run(
        "root.create_entity",
        model,
        ifc_class="IfcPump",
        predefined_type="CENTRIFUGAL",
        name="Primary Pump",
    )
    tank = ifcopenshell.api.run(
        "root.create_entity",
        model,
        ifc_class="IfcTank",
        predefined_type="BASIN",
        name="Buffer Tank",
    )
    ifcopenshell.api.run(
        "spatial.assign_container",
        model,
        products=[pump, tank],
        relating_structure=storey,
    )

    pump.Tag = "P-101"
    tank.Tag = "T-201"

    pump_representation = ifcopenshell.api.run(
        "geometry.add_wall_representation",
        model,
        context=body_context,
        length=1.4,
        height=0.8,
        thickness=0.5,
    )
    tank_representation = ifcopenshell.api.run(
        "geometry.add_wall_representation",
        model,
        context=body_context,
        length=2.0,
        height=1.2,
        thickness=1.0,
    )
    ifcopenshell.api.run(
        "geometry.assign_representation",
        model,
        product=pump,
        representation=pump_representation,
    )
    ifcopenshell.api.run(
        "geometry.assign_representation",
        model,
        product=tank,
        representation=tank_representation,
    )
    ifcopenshell.api.run(
        "geometry.edit_object_placement",
        model,
        product=pump,
        matrix=[
            [1.0, 0.0, 0.0, 2.0],
            [0.0, 1.0, 0.0, 1.0],
            [0.0, 0.0, 1.0, 0.0],
            [0.0, 0.0, 0.0, 1.0],
        ],
    )
    ifcopenshell.api.run(
        "geometry.edit_object_placement",
        model,
        product=tank,
        matrix=[
            [1.0, 0.0, 0.0, 5.0],
            [0.0, 1.0, 0.0, 2.0],
            [0.0, 0.0, 1.0, 0.0],
            [0.0, 0.0, 0.0, 1.0],
        ],
    )

    for product, name, color in (
        (pump, "Pump Blue", (0.12, 0.42, 0.78)),
        (tank, "Tank Orange", (0.92, 0.46, 0.08)),
    ):
        style = ifcopenshell.api.run("style.add_style", model, name=name)
        ifcopenshell.api.run(
            "style.add_surface_style",
            model,
            style=style,
            ifc_class="IfcSurfaceStyleShading",
            attributes={
                "SurfaceColour": {
                    "Name": None,
                    "Red": color[0],
                    "Green": color[1],
                    "Blue": color[2],
                },
                "Transparency": 0.0,
            },
        )
        representation = (
            pump.Representation.Representations[0]
            if product is pump
            else tank.Representation.Representations[0]
        )
        ifcopenshell.api.run(
            "style.assign_representation_styles",
            model,
            shape_representation=representation,
            styles=[style],
        )

    pump_pset = ifcopenshell.api.run(
        "pset.add_pset",
        model,
        product=pump,
        name="Pset_PumpTypeCommon",
    )
    ifcopenshell.api.run(
        "pset.edit_pset",
        model,
        pset=pump_pset,
        properties={
            "FlowRate": 12.5,
            "PumpType": "CENTRIFUGAL",
            "IsVariableSpeed": True,
        },
    )
    tank_pset = ifcopenshell.api.run(
        "pset.add_pset",
        model,
        product=tank,
        name="Pset_TankTypeCommon",
    )
    ifcopenshell.api.run(
        "pset.edit_pset",
        model,
        pset=tank_pset,
        properties={
            "NominalCapacity": 20.0,
            "StorageType": "LIQUID",
        },
    )
    quantity = ifcopenshell.api.run(
        "pset.add_qto",
        model,
        product=pump,
        name="Qto_PumpBaseQuantities",
    )
    ifcopenshell.api.run(
        "pset.edit_qto",
        model,
        qto=quantity,
        properties={
            "GrossWeight": 480.0,
            "Length": 1400.0,
        },
    )

    system = ifcopenshell.api.run(
        "system.add_system",
        model,
        ifc_class="IfcDistributionSystem",
    )
    system.Name = "Sludge Transfer"
    system.PredefinedType = "WASTEWATER"
    ifcopenshell.api.run(
        "system.assign_system",
        model,
        products=[pump, tank],
        system=system,
    )
    return model


def main(output: str, unsupported_unit_output: str | None) -> None:
    output_path = Path(output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    model = create_model(True)
    model.write(output_path.as_posix())

    if unsupported_unit_output:
        unsupported_path = Path(unsupported_unit_output)
        unsupported_path.parent.mkdir(parents=True, exist_ok=True)
        create_model(False).write(unsupported_path.as_posix())


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3):
        raise SystemExit(
            "usage: generate-synthetic-plant.py OUTPUT [UNSUPPORTED_UNIT_OUTPUT]"
        )
    main(sys.argv[1], sys.argv[2] if len(sys.argv) == 3 else None)
