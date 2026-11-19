export const warehouses = [
 {id: 'snidane', view: 'inventory', title: 'Sklad Snídaně'},
 {id: 'drogerie', view: 'inventory-drogerie', title: 'Sklad Drogerie'},
];

export const warehouseForView = name =>
 [...warehouses].reverse().find(warehouse => name === warehouse.view || name.startsWith(warehouse.view + '-'));

export const inventoryPath = (warehouse, suffix = '', query = '') =>
 'api/v1/inventory' + suffix + '?warehouse=' + warehouse.id + query;

export const warehousePermission = (warehouse, action) => 'inventory_' + warehouse.id + ':' + action;
