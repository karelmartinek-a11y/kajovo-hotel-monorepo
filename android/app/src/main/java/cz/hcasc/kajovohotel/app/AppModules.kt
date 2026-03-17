package cz.hcasc.kajovohotel.app

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.preferencesDataStoreFile
import androidx.room.Room
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import cz.hcasc.kajovohotel.core.common.AppLogger
import cz.hcasc.kajovohotel.core.common.BaseUrlConfig
import cz.hcasc.kajovohotel.core.database.KajovoDatabase
import cz.hcasc.kajovohotel.core.database.ModuleSnapshotDao
import cz.hcasc.kajovohotel.core.network.AuthNetworkEventStore
import cz.hcasc.kajovohotel.core.network.CsrfTokenInterceptor
import cz.hcasc.kajovohotel.core.network.InMemoryAuthNetworkEventStore
import cz.hcasc.kajovohotel.core.network.RequestIdInterceptor
import cz.hcasc.kajovohotel.core.network.SessionGuardInterceptor
import cz.hcasc.kajovohotel.core.network.api.AuthApi
import cz.hcasc.kajovohotel.core.network.api.BreakfastApi
import cz.hcasc.kajovohotel.core.network.api.InventoryApi
import cz.hcasc.kajovohotel.core.network.api.IssuesApi
import cz.hcasc.kajovohotel.core.network.api.LostFoundApi
import cz.hcasc.kajovohotel.core.network.cookie.CookieVault
import cz.hcasc.kajovohotel.core.network.cookie.PersistingCookieJar
import cz.hcasc.kajovohotel.core.session.CookieBackedSessionCookieStore
import cz.hcasc.kajovohotel.core.session.DefaultSessionRepository
import cz.hcasc.kajovohotel.core.session.SecureCookieVault
import cz.hcasc.kajovohotel.core.session.SessionCookieStore
import cz.hcasc.kajovohotel.core.session.SessionMetadataStore
import cz.hcasc.kajovohotel.core.session.SessionPreferencesStore
import cz.hcasc.kajovohotel.core.session.SessionRepository
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import java.util.concurrent.TimeUnit
import javax.inject.Singleton
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory

@Module
@InstallIn(SingletonComponent::class)
object AppModules {
    @Provides
    @Singleton
    fun provideBaseUrlConfig(): BaseUrlConfig = BaseUrlConfig(BuildConfig.HOTEL_BASE_URL)

    @Provides
    @Singleton
    fun provideLogger(): AppLogger = AppLogger()

    @Provides
    @Singleton
    fun providePreferencesDataStore(@ApplicationContext context: Context): DataStore<Preferences> {
        return PreferenceDataStoreFactory.create(
            produceFile = { context.preferencesDataStoreFile("session.preferences_pb") },
        )
    }

    @Provides
    @Singleton
    fun provideMoshi(): Moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()

    @Provides
    @Singleton
    fun provideCookieVault(@ApplicationContext context: Context, moshi: Moshi): CookieVault {
        return SecureCookieVault(
            context.getSharedPreferences("kajovo_hotel_cookie_vault", Context.MODE_PRIVATE),
            moshi,
        )
    }

    @Provides
    @Singleton
    fun provideCookieJar(cookieVault: CookieVault): PersistingCookieJar = PersistingCookieJar(cookieVault)

    @Provides
    @Singleton
    fun provideAuthNetworkEventStore(): AuthNetworkEventStore = InMemoryAuthNetworkEventStore()

    @Provides
    @Singleton
    fun provideOkHttpClient(
        cookieJar: PersistingCookieJar,
        eventStore: AuthNetworkEventStore,
    ): OkHttpClient {
        val logging = HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC }
        return OkHttpClient.Builder()
            .cookieJar(cookieJar)
            .addInterceptor(RequestIdInterceptor())
            .addInterceptor(CsrfTokenInterceptor(cookieJar))
            .addInterceptor(SessionGuardInterceptor(eventStore))
            .addInterceptor(logging)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    @Provides
    @Singleton
    fun provideRetrofit(
        baseUrlConfig: BaseUrlConfig,
        okHttpClient: OkHttpClient,
        moshi: Moshi,
    ): Retrofit {
        return Retrofit.Builder()
            .baseUrl(baseUrlConfig.value)
            .client(okHttpClient)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
    }

    @Provides
    @Singleton
    fun provideAuthApi(retrofit: Retrofit): AuthApi = retrofit.create(AuthApi::class.java)

    @Provides
    @Singleton
    fun provideBreakfastApi(retrofit: Retrofit): BreakfastApi = retrofit.create(BreakfastApi::class.java)

    @Provides
    @Singleton
    fun provideLostFoundApi(retrofit: Retrofit): LostFoundApi = retrofit.create(LostFoundApi::class.java)

    @Provides
    @Singleton
    fun provideIssuesApi(retrofit: Retrofit): IssuesApi = retrofit.create(IssuesApi::class.java)

    @Provides
    @Singleton
    fun provideInventoryApi(retrofit: Retrofit): InventoryApi = retrofit.create(InventoryApi::class.java)

    @Provides
    @Singleton
    fun provideSessionPreferencesStore(dataStore: DataStore<Preferences>): SessionPreferencesStore {
        return SessionPreferencesStore(dataStore)
    }

    @Provides
    @Singleton
    fun provideSessionMetadataStore(sessionPreferencesStore: SessionPreferencesStore): SessionMetadataStore = sessionPreferencesStore

    @Provides
    @Singleton
    fun provideSessionCookieStore(cookieJar: PersistingCookieJar): SessionCookieStore = CookieBackedSessionCookieStore(cookieJar)

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): KajovoDatabase {
        return Room.databaseBuilder(context, KajovoDatabase::class.java, "kajovo-hotel.db").build()
    }

    @Provides
    @Singleton
    fun provideModuleSnapshotDao(database: KajovoDatabase): ModuleSnapshotDao = database.moduleSnapshotDao()

    @Provides
    @Singleton
    fun provideSessionRepository(
        authApi: AuthApi,
        sessionCookieStore: SessionCookieStore,
        sessionMetadataStore: SessionMetadataStore,
        moduleSnapshotDao: ModuleSnapshotDao,
        logger: AppLogger,
    ): SessionRepository {
        return DefaultSessionRepository(
            authApi = authApi,
            cookieStore = sessionCookieStore,
            metadataStore = sessionMetadataStore,
            moduleSnapshotDao = moduleSnapshotDao,
            logger = logger,
        )
    }
}
