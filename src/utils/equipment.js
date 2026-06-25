const EQUIPMENT_COLUMN_KEYS = {
  horses: 'horses',
  muskets: 'muskets',
  field_guns: 'fieldGuns'
}

// Converts stored names such as field_guns into the matching JavaScript column key
// Unsupported names return undefined, which stops random keys from sneaking into an update
export function getEquipmentColumnKey(equipmentName) {
  if (!Object.hasOwn(EQUIPMENT_COLUMN_KEYS, equipmentName)) return undefined
  return EQUIPMENT_COLUMN_KEYS[equipmentName]
}
