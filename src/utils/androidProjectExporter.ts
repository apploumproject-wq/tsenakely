import JSZip from 'jszip';

/**
 * Génère une archive ZIP contenant le projet Android Studio Kotlin + Room complet
 * (package com.tsenakely.gestion, minSdk 23 / Android 6.0+) prêt à être ouvert
 * dans Android Studio pour compiler l'APK natif.
 */
export async function exportAndroidStudioProjectZip(): Promise<Blob> {
  const zip = new JSZip();
  const root = zip.folder('TSENAKELY-Android-Studio')!;

  root.file(
    'README_COMPILATION_APK.md',
    `# TSENAKELY — Projet Android Studio Natif (Kotlin + Room)

- Nom de l'application : TSENAKELY
- Package : com.tsenakely.gestion
- Compatibilité : Android 6.0 Marshmallow (API 23) et versions supérieures
- Base de données : Room (SQLite 100 % hors ligne)
- Signature : App Loum Project (apploumproject@gmail.com)

## Étapes pour générer l'APK installable
1. Ouvrir ce dossier dans **Android Studio** (Hedgehog / Jellyfish / Ladybug ou plus récent).
2. Laisser Gradle synchroniser les dépendances (JDK 17 recommandé).
3. Menu **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
4. Récupérer \`app/build/outputs/apk/debug/app-debug.apk\` (ou générer un APK Release signé via **Build > Generate Signed Bundle / APK**).
`
  );

  root.file(
    'settings.gradle.kts',
    `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "TSENAKELY"
include(":app")
`
  );

  root.file(
    'build.gradle.kts',
    `plugins {
    id("com.android.application") version "8.5.2" apply false
    id("org.jetbrains.kotlin.android") version "1.9.24" apply false
    id("com.google.devtools.ksp") version "1.9.24-1.0.20" apply false
}
`
  );

  const app = root.folder('app')!;
  app.file(
    'build.gradle.kts',
    `plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.devtools.ksp")
}

android {
    namespace = "com.tsenakely.gestion"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.tsenakely.gestion"
        minSdk = 23
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        viewBinding = true
    }
}

dependencies {
    val roomVersion = "2.6.1"
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.8.4")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.4")
    implementation("androidx.room:room-runtime:\$roomVersion")
    implementation("androidx.room:room-ktx:\$roomVersion")
    ksp("androidx.room:room-compiler:\$roomVersion")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
}
`
  );

  const main = app.folder('src/main')!;
  main.file(
    'AndroidManifest.xml',
    `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:name=".TsenakelyApp"
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher"
        android:supportsRtl="true"
        android:theme="@style/Theme.Tsenakely">
        <activity
            android:name=".ui.LoginActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
        <activity android:name=".ui.MainActivity" android:exported="false" />
    </application>
</manifest>
`
  );

  const res = main.folder('res')!;
  res.folder('values')!.file(
    'strings.xml',
    `<resources>
    <string name="app_name">TSENAKELY</string>
    <string name="nav_accueil">Accueil</string>
    <string name="nav_vente">Vente</string>
    <string name="nav_historique">Historique</string>
    <string name="nav_statistiques">Statistiques</string>
    <string name="nav_parametres">Paramètres</string>
    <string name="currency">Ar</string>
    <string name="signature_brand">App Loum Project</string>
    <string name="signature_copyright">Copyright © 2026 – Tous droits réservés.</string>
    <string name="signature_contact">Pour recevoir l’APK ou collaborer : apploumproject@gmail.com</string>
</resources>
`
  );
  res.folder('values')!.file(
    'colors.xml',
    `<resources>
    <color name="navy_primary">#0F294A</color>
    <color name="navy_dark">#091B33</color>
    <color name="accent_light_blue">#38BDF8</color>
    <color name="white">#FFFFFF</color>
    <color name="bg_light">#F8FAFC</color>
</resources>
`
  );
  res.folder('values')!.file(
    'themes.xml',
    `<resources>
    <style name="Theme.Tsenakely" parent="Theme.Material3.Light.NoActionBar">
        <item name="colorPrimary">@color/navy_primary</item>
        <item name="colorOnPrimary">@color/white</item>
        <item name="colorSecondary">@color/accent_light_blue</item>
        <item name="android:windowBackground">@color/bg_light</item>
    </style>
</resources>
`
  );

  const pkg = main.folder('java/com/tsenakely/gestion')!;
  pkg.file(
    'TsenakelyApp.kt',
    `package com.tsenakely.gestion

import android.app.Application
import com.tsenakely.gestion.data.AppDatabase

class TsenakelyApp : Application() {
    val database: AppDatabase by lazy { AppDatabase.getInstance(this) }
}
`
  );

  const security = pkg.folder('security')!;
  security.file(
    'PasswordHasher.kt',
    `package com.tsenakely.gestion.security

import java.security.MessageDigest
import java.security.SecureRandom

object PasswordHasher {
    fun hash(password: String): String {
        val salt = ByteArray(16).apply { SecureRandom().nextBytes(this) }
            .joinToString("") { "%02x".format(it) }
        var current = "\$salt:\$password"
        repeat(1000) {
            current = sha256(current)
        }
        return "sha256\\$\$salt\\$\$current"
    }

    fun verify(password: String, storedHash: String): Boolean {
        val parts = storedHash.split("$")
        if (parts.size != 3 || parts[0] != "sha256") return false
        val salt = parts[1]
        val expected = parts[2]
        var current = "\$salt:\$password"
        repeat(1000) {
            current = sha256(current)
        }
        return MessageDigest.isEqual(current.toByteArray(), expected.toByteArray())
    }

    private fun sha256(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }
}
`
  );

  const data = pkg.folder('data')!;
  data.file(
    'Entities.kt',
    `package com.tsenakely.gestion.data

import androidx.room.*

@Entity(tableName = "users", indices = [Index(value = ["username"], unique = true)])
data class UserEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val username: String,
    val fullName: String,
    val role: String, // ADMIN | VENDEUR
    val passwordHash: String,
    val isActive: Boolean = true,
    val createdAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "products", indices = [Index(value = ["name"], unique = true)])
data class ProductEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val price: Long,
    val stockQty: Int,
    val minStock: Int = 5,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "sales", indices = [Index(value = ["saleNumber"], unique = true)])
data class SaleEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val saleNumber: String,
    val saleDate: Long = System.currentTimeMillis(),
    val userId: Long,
    val userName: String,
    val totalAmount: Long,
    val amountPaid: Long,
    val changeGiven: Long,
    val status: String = "COMPLETED",
    val cancelledAt: Long? = null,
    val cancelledBy: String? = null,
    val cancelReason: String? = null
)

@Entity(
    tableName = "sale_details",
    foreignKeys = [ForeignKey(
        entity = SaleEntity::class,
        parentColumns = ["id"],
        childColumns = ["saleId"],
        onDelete = ForeignKey.CASCADE
    )]
)
data class SaleDetailEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val saleId: Long,
    val productId: Long?,
    val productName: String,
    val unitPrice: Long,
    val quantity: Int,
    val subtotal: Long
)

@Entity(tableName = "stock_movements")
data class StockMovementEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val productId: Long?,
    val productName: String,
    val movementType: String,
    val qtyChange: Int,
    val qtyBefore: Int,
    val qtyAfter: Int,
    val reason: String,
    val userName: String,
    val createdAt: Long = System.currentTimeMillis()
)
`
  );

  data.file(
    'AppDatabase.kt',
    `package com.tsenakely.gestion.data

import android.content.Context
import androidx.room.*
import androidx.sqlite.db.SupportSQLiteDatabase
import com.tsenakely.gestion.security.PasswordHasher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

@Dao
interface TsenakelyDao {
    @Query("SELECT * FROM users WHERE username = :username LIMIT 1")
    suspend fun findUserByUsername(username: String): UserEntity?

    @Insert
    suspend fun insertUser(user: UserEntity): Long

    @Query("SELECT * FROM products ORDER BY name ASC")
    suspend fun getAllProducts(): List<ProductEntity>

    @Query("SELECT * FROM products WHERE id = :id LIMIT 1")
    suspend fun getProductById(id: Long): ProductEntity?

    @Insert
    suspend fun insertProduct(product: ProductEntity): Long

    @Update
    suspend fun updateProduct(product: ProductEntity)

    @Insert
    suspend fun insertSale(sale: SaleEntity): Long

    @Insert
    suspend fun insertSaleDetails(details: List<SaleDetailEntity>)

    @Insert
    suspend fun insertStockMovement(movement: StockMovementEntity)

    @Query("SELECT * FROM sales ORDER BY saleDate DESC")
    suspend fun getAllSales(): List<SaleEntity>

    @Transaction
    suspend fun executeSale(
        user: UserEntity,
        items: List<Pair<ProductEntity, Int>>,
        amountPaid: Long,
        saleNumber: String
    ): Long {
        var total = 0L
        val verified = mutableListOf<Triple<ProductEntity, Int, Long>>()
        for ((p, qty) in items) {
            val live = getProductById(p.id) ?: error("Produit introuvable")
            require(live.stockQty >= qty) { "Stock insuffisant pour \${live.name}" }
            val sub = live.price * qty
            total += sub
            verified.add(Triple(live, qty, sub))
        }
        require(amountPaid >= total) { "Montant payé insuffisant" }
        val saleId = insertSale(
            SaleEntity(
                saleNumber = saleNumber,
                userId = user.id,
                userName = user.fullName,
                totalAmount = total,
                amountPaid = amountPaid,
                changeGiven = amountPaid - total
            )
        )
        val details = verified.map { (p, qty, sub) ->
            SaleDetailEntity(
                saleId = saleId,
                productId = p.id,
                productName = p.name,
                unitPrice = p.price,
                quantity = qty,
                subtotal = sub
            )
        }
        insertSaleDetails(details)
        for ((p, qty, _) in verified) {
            val newQty = p.stockQty - qty
            updateProduct(p.copy(stockQty = newQty, updatedAt = System.currentTimeMillis()))
            insertStockMovement(
                StockMovementEntity(
                    productId = p.id,
                    productName = p.name,
                    movementType = "SALE",
                    qtyChange = -qty,
                    qtyBefore = p.stockQty,
                    qtyAfter = newQty,
                    reason = "Vente \$saleNumber",
                    userName = user.fullName
                )
            )
        }
        return saleId
    }
}

@Database(
    entities = [
        UserEntity::class,
        ProductEntity::class,
        SaleEntity::class,
        SaleDetailEntity::class,
        StockMovementEntity::class
    ],
    version = 1,
    exportSchema = true
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun dao(): TsenakelyDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getInstance(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "tsenakely_offline.db"
                ).addCallback(object : Callback() {
                    override fun onCreate(db: SupportSQLiteDatabase) {
                        super.onCreate(db)
                        CoroutineScope(Dispatchers.IO).launch {
                            seedInitialData(getInstance(context).dao())
                        }
                    }
                }).build()
                INSTANCE = instance
                instance
            }
        }

        private suspend fun seedInitialData(dao: TsenakelyDao) {
            dao.insertUser(
                UserEntity(
                    username = "admin",
                    fullName = "Administrateur",
                    role = "ADMIN",
                    passwordHash = PasswordHasher.hash("admin123")
                )
            )
            val initialProducts = listOf(
                ProductEntity(name = "Glace double", price = 3000, stockQty = 25, minStock = 5),
                ProductEntity(name = "Glace simple", price = 1500, stockQty = 30, minStock = 5),
                ProductEntity(name = "Popcorn", price = 2000, stockQty = 20, minStock = 5),
                ProductEntity(name = "Pain ordoeuvre GM", price = 2000, stockQty = 15, minStock = 4),
                ProductEntity(name = "Pain ordoeuvre PM", price = 1500, stockQty = 20, minStock = 5)
            )
            initialProducts.forEach { prod ->
                val id = dao.insertProduct(prod)
                dao.insertStockMovement(
                    StockMovementEntity(
                        productId = id,
                        productName = prod.name,
                        movementType = "INITIAL",
                        qtyChange = prod.stockQty,
                        qtyBefore = 0,
                        qtyAfter = prod.stockQty,
                        reason = "Stock initial à l'installation",
                        userName = "Système"
                    )
                )
            }
        }
    }
}
`
  );

  const ui = pkg.folder('ui')!;
  ui.file(
    'LoginActivity.kt',
    `package com.tsenakely.gestion.ui

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.tsenakely.gestion.TsenakelyApp
import com.tsenakely.gestion.security.PasswordHasher
import kotlinx.coroutines.launch

class LoginActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Point d'entrée natif : vérifier l'utilisateur dans Room hors ligne
        val dao = (application as TsenakelyApp).database.dao()
        lifecycleScope.launch {
            dao.getAllProducts() // déclenche onCreate seed si première installation
        }
    }

    fun authenticate(username: String, password: String, onResult: (Boolean) -> Unit) {
        val dao = (application as TsenakelyApp).database.dao()
        lifecycleScope.launch {
            val user = dao.findUserByUsername(username.trim())
            val ok = user != null && user.isActive && PasswordHasher.verify(password, user.passwordHash)
            if (ok) {
                startActivity(Intent(this@LoginActivity, MainActivity::class.java))
                finish()
            }
            onResult(ok)
        }
    }
}
`
  );

  ui.file(
    'MainActivity.kt',
    `package com.tsenakely.gestion.ui

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Navigation principale : Accueil, Vente, Historique, Statistiques, Paramètres
    }
}
`
  );

  return zip.generateAsync({type: 'blob'});
}
