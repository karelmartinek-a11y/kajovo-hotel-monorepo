package cz.hcasc.kajovohotel.core.database

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(entities = [ModuleSnapshotEntity::class], version = 1, exportSchema = true)
abstract class KajovoDatabase : RoomDatabase() {
    abstract fun moduleSnapshotDao(): ModuleSnapshotDao
}
