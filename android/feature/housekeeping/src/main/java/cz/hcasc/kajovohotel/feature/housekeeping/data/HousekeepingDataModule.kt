package cz.hcasc.kajovohotel.feature.housekeeping.data

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class HousekeepingDataModule {
    @Binds
    @Singleton
    abstract fun bindHousekeepingDraftStore(
        implementation: FileHousekeepingDraftStore,
    ): HousekeepingDraftStore
}
