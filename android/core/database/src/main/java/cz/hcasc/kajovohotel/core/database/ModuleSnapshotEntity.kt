package cz.hcasc.kajovohotel.core.database

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "module_snapshots")
data class ModuleSnapshotEntity(@PrimaryKey val key: String, val payload: String, val updatedAt: Long)
