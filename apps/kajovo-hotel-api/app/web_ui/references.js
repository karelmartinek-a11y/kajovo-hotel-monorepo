const refs={
  "issues": {
    "new": [
      "hotel.admin.15",
      "hotel.portal.55"
    ],
    "edit": [
      "hotel.admin.17",
      "hotel.portal.57"
    ],
    "detail": [
      "hotel.admin.16",
      "hotel.portal.56"
    ],
    "delete": [
      "hotel.issues.delete",
      "hotel.issues.delete"
    ]
  },
  "reports": {
    "new": [
      "hotel.admin.23",
      "hotel.portal.63"
    ],
    "edit": [
      "hotel.admin.25",
      "hotel.portal.65"
    ],
    "detail": [
      "hotel.admin.24",
      "hotel.portal.64"
    ],
    "delete": [
      "hotel.reports.delete",
      "hotel.reports.delete"
    ]
  },
  "lost-found": {
    "new": [
      "hotel.admin.11",
      "hotel.portal.51"
    ],
    "edit": [
      "hotel.admin.13",
      "hotel.portal.53"
    ],
    "detail": [
      "hotel.admin.12",
      "hotel.portal.52"
    ],
    "delete": [
      "hotel.lostfound.delete",
      "hotel.lostfound.delete"
    ]
  },
  "inventory": {
    "new": [
      "hotel.admin.19",
      "hotel.portal.59"
    ],
    "edit": [
      "hotel.admin.21",
      "hotel.portal.61"
    ],
    "detail": [
      "hotel.admin.20",
      "hotel.portal.60"
    ],
    "delete": [
      "hotel.inventory.item-delete",
      "hotel.inventory.item-delete"
    ]
  }
};
const titles={
  "hotel.admin.11": "Nový nález nebo ztráta",
  "hotel.admin.12": "Detail nálezu nebo ztráty",
  "hotel.admin.13": "Upravit nález nebo ztrátu",
  "hotel.admin.15": "Nová závada",
  "hotel.admin.16": "Detail závady",
  "hotel.admin.17": "Upravit závadu",
  "hotel.admin.19": "Nová skladová položka",
  "hotel.admin.20": "Detail skladové položky",
  "hotel.admin.21": "Upravit skladovou položku",
  "hotel.admin.23": "Nové hlášení",
  "hotel.admin.24": "Detail hlášení",
  "hotel.admin.25": "Upravit hlášení",
  "hotel.issues.delete": "Smazat závadu",
  "hotel.lostfound.delete": "Smazat nález nebo ztrátu",
  "hotel.portal.51": "Nový nález nebo ztráta",
  "hotel.portal.52": "Detail nálezu nebo ztráty",
  "hotel.portal.53": "Upravit nález nebo ztrátu",
  "hotel.portal.55": "Nová závada",
  "hotel.portal.56": "Detail závady",
  "hotel.portal.57": "Upravit závadu",
  "hotel.portal.59": "Nová skladová položka",
  "hotel.portal.60": "Detail skladové položky",
  "hotel.portal.61": "Upravit skladovou položku",
  "hotel.portal.63": "Nové hlášení",
  "hotel.portal.64": "Detail hlášení",
  "hotel.portal.65": "Upravit hlášení",
  "hotel.reports.delete": "Smazat hlášení",
  "hotel.inventory.item-delete": "Smazat skladovou položku"
};
export function moduleReference(path,kind,admin){const id=refs[path]?.[kind]?.[admin?0:1];return {id,title:titles[id]??'Odstranit záznam'};}
