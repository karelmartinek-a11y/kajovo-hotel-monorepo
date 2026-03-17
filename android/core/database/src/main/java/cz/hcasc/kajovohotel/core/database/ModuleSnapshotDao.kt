package cz.hcasc.kajovohotel.core.database

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface ModuleSnapshotDao {
    @Query("SELECT * FROM module_snapshots WHERE key = :key LIMIT 1") suspend fun get(key: String): ModuleSnapshotEntity?
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsert(entity: ModuleSnapshotEntity)
    @Query("DELETE FROM module_snapshots") suspend fun clearAll()
}
