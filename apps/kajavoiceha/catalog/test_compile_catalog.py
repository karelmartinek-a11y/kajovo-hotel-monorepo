"""Permission-boundary tests use fabricated metadata, never the production inventory."""
import copy
import unittest
from unittest.mock import patch
import compile_catalog as compiler


def fixture():
    rows, entities, actions, registry, states = [], [], [], [], []
    for index in range(199):
        identifier = f"private-{index}"
        entity = f"light.private_{index}"
        rows.append((index+7,{"A": f"Lamp {index}","B":"Room","D":"Kamera" if index==0 else "Světlo","E":"light.turn_on; light.turn_off; light.toggle","F":"state; brightness; supported_color_modes; access_token","R":identifier,"V":entity}))
        attrs={"supported_color_modes":["hs"],"brightness":120,"supported_features":0}
        item=[None]*22
        item[0],item[2],item[3],item[6],item[10],item[14],item[15]=identifier,entity,f"Lamp {index}","","",compiler.json.dumps(attrs),compiler.json.dumps({"supported_color_modes":["hs"]})
        entities.append(item)
        for operation in ("turn_on","turn_off","toggle"):
            fields={"rgb_color":{"selector":{"color_rgb":None}},"brightness_pct":{"selector":{"number":{"min":0,"max":100}}}} if operation!="turn_off" else {}
            actions.append([identifier,f"Lamp {index}",entity,f"Lamp {index}","light."+operation,"",compiler.json.dumps(fields),"declared",""])
        registry.append({"entity_id":entity})
        states.append({"entity_id":entity,"state":"on","attributes":attrs})
    for index in range(27):
        rows.append((206+index,{"A":f"Excluded {index}","D":"Ignoruj","R":f"excluded-{index}"}))
    return rows,{"entities":entities,"actions":actions},{"entities":registry},{"features":{"light":{}}},{"generated_at":"2026-10-02T10:00:00Z","states":states}


class PermissionBoundary(unittest.TestCase):
    def compile(self, values):
        rows,inventory,registry,metadata,states=values
        with patch.object(compiler,"workbook_rows",return_value=rows):
            return compiler.compile_catalog(None,inventory,registry,metadata,states)

    def test_extra_live_entities_never_enter_public_catalog(self):
        values=fixture()
        values[-1]["states"].append({"entity_id":"light.unapproved_extra","state":"on","attributes":{"access_token":"NEVER-OUTPUT"}})
        private,public=self.compile(values)
        self.assertEqual(len(public["devices"]),199)
        self.assertEqual(set(public["devices"][0]),{x["key"] for x in compiler.FIELDS})
        serialized=compiler.json.dumps(public)
        for forbidden in ("Excluded", "unapproved_extra", "NEVER-OUTPUT", "access_token", "light.private_", "private-0"):
            self.assertNotIn(forbidden,serialized)

    def test_kind_cannot_grant_camera_capability(self):
        private,public=self.compile(fixture())
        self.assertEqual(public["devices"][0]["kind"],"Kamera")
        self.assertIsNone(private["devices"][0]["camera_entity_id"])
        self.assertTrue(all(c["domain"]=="light" for c in private["devices"][0]["controls"]))

    def test_duplicate_mapping_is_rejected(self):
        values=fixture()
        values[0][1]=copy.deepcopy(values[0][0])
        with self.assertRaisesRegex(ValueError,"Duplicate stable"):
            self.compile(values)

    def test_unapproved_target_is_rejected(self):
        values=fixture()
        values[0][0][1]["V"]="light.unapproved"
        with self.assertRaisesRegex(ValueError,"Unresolved entity"):
            self.compile(values)

    def test_unmapped_approved_service_is_rejected(self):
        values=fixture()
        values[0][0][1]["E"] += "; light.delete_everything"
        with self.assertRaisesRegex(ValueError,"no validated target"):
            self.compile(values)

    def test_unknown_state_differs_from_unavailable(self):
        values=fixture()
        values[-1]["states"][0]["state"]="unknown"
        values[-1]["states"][1]["state"]="unavailable"
        _,public=self.compile(values)
        self.assertTrue(public["devices"][0]["availability"]["available"])
        self.assertFalse(public["devices"][1]["availability"]["available"])

    def test_light_parameters_require_actual_modes_and_features(self):
        fields={
            "rgb_color":{"selector":{"color_rgb":None}},
            "rgbw_color":{"selector":{"object":None}},
            "rgbww_color":{"selector":{"object":None}},
            "color_temp_kelvin":{"selector":{"color_temp":{"min":2000,"max":6500}}},
            "brightness_pct":{"selector":{"number":{"min":0,"max":100}}},
            "white":{"selector":{"constant":{"value":True}}},
            "transition":{"selector":{"number":{"min":0,"max":300}}},
            "effect":{"actual_options":["Gentle"],"selector":{"state":{}}},
            "flash":{"selector":{"select":{"options":["short","long"]}}},
        }
        def keys(modes,mask=0):
            schema,_,requirements=compiler.parameters_for(fields,{"supported_color_modes":modes,"supported_features":mask},{"TRANSITION":32,"EFFECT":4,"FLASH":8})
            self.assertTrue(all(req.get("color_modes",["not applicable"]) for req in requirements.values()))
            return set(schema["properties"]),requirements
        self.assertEqual(keys(["hs"])[0],{"rgb","brightness_percent"})
        self.assertEqual(keys(["color_temp"])[0],{"white_temperature_kelvin","brightness_percent"})
        self.assertEqual(keys(["rgbw"])[0],{"rgb","rgbw","brightness_percent"})
        self.assertEqual(keys(["rgbww"])[0],{"rgb","rgbww","brightness_percent"})
        self.assertEqual(keys(["onoff"])[0],set())
        self.assertEqual(keys([])[0],set())
        self.assertEqual(keys(["white"])[0],{"white_only","brightness_percent"})
        self.assertTrue({"transition_seconds","effect","flash"}.issubset(keys(["hs"],44)[0]))
        self.assertEqual(keys(["hs","color_temp"])[1]["white_temperature_kelvin"]["color_modes"],["color_temp"])


if __name__=="__main__":unittest.main()
