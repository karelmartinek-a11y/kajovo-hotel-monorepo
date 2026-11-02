import {t,locale} from './i18n.js';
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
  "hotel.admin.11": t("Nový nález nebo ztráta"),
  "hotel.admin.12": t("Detail nálezu nebo ztráty"),
  "hotel.admin.13": t("Upravit nález nebo ztrátu"),
  "hotel.admin.15": t("Nová závada"),
  "hotel.admin.16": t("Detail závady"),
  "hotel.admin.17": t("Upravit závadu"),
  "hotel.admin.19": t("Nová skladová položka"),
  "hotel.admin.20": t("Detail skladové položky"),
  "hotel.admin.21": t("Upravit skladovou položku"),
  "hotel.admin.23": t("Nové hlášení"),
  "hotel.admin.24": t("Detail hlášení"),
  "hotel.admin.25": t("Upravit hlášení"),
  "hotel.issues.delete": t("Smazat závadu"),
  "hotel.lostfound.delete": t("Smazat nález nebo ztrátu"),
  "hotel.portal.51": t("Nový nález nebo ztráta"),
  "hotel.portal.52": t("Detail nálezu nebo ztráty"),
  "hotel.portal.53": t("Upravit nález nebo ztrátu"),
  "hotel.portal.55": t("Nová závada"),
  "hotel.portal.56": t("Detail závady"),
  "hotel.portal.57": t("Upravit závadu"),
  "hotel.portal.59": t("Nová skladová položka"),
  "hotel.portal.60": t("Detail skladové položky"),
  "hotel.portal.61": t("Upravit skladovou položku"),
  "hotel.portal.63": t("Nové hlášení"),
  "hotel.portal.64": t("Detail hlášení"),
  "hotel.portal.65": t("Upravit hlášení"),
  "hotel.reports.delete": t("Smazat hlášení"),
  "hotel.inventory.item-delete": t("Smazat skladovou položku")
};
export function moduleReference(path,kind,admin){const id=refs[path]?.[kind]?.[admin?0:1];return {id,title:titles[id]??t('Odstranit záznam')};}
