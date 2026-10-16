package expo.modules.wakeword

import android.content.Context
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.ZipInputStream

/**
 * The Vosk speech model (small Indian-English, ~36 MB, Apache-2.0) is downloaded
 * once on first use into the app's private storage, rather than shipped in the APK.
 */
object VoskModel {
  private const val NAME = "vosk-model-small-en-in-0.4"
  private const val URL_STRING = "https://alphacephei.com/vosk/models/$NAME.zip"
  private const val READY_MARKER = ".nova-ready"

  /** Wake phrases to try, in order; the first whose words the model knows is used. */
  private val PHRASES = listOf("hey nova", "okay nova", "hey computer")

  private fun root(context: Context) = File(context.filesDir, "vosk")

  fun modelDir(context: Context): File = File(root(context), NAME)

  fun isReady(context: Context): Boolean = File(modelDir(context), READY_MARKER).exists()

  /**
   * Downloads and unpacks the model if needed. Blocking: call off the main thread.
   * [progress] receives (stage, 0..1).
   */
  @Throws(IOException::class)
  fun ensure(context: Context, progress: (stage: String, value: Double) -> Unit) {
    if (isReady(context)) {
      progress("ready", 1.0)
      return
    }
    val root = root(context)
    root.mkdirs()
    val zip = File(root, "model.zip.part")
    download(zip) { progress("downloading", it) }
    progress("unpacking", 0.0)
    unzip(zip, root)
    zip.delete()
    val dir = modelDir(context)
    if (!dir.isDirectory) throw IOException("Model folder missing after unpacking")
    File(dir, READY_MARKER).writeText("ok")
    progress("ready", 1.0)
  }

  private fun download(dest: File, onProgress: (Double) -> Unit) {
    val connection = URL(URL_STRING).openConnection() as HttpURLConnection
    connection.connectTimeout = 20_000
    connection.readTimeout = 30_000
    connection.instanceFollowRedirects = true
    try {
      connection.connect()
      if (connection.responseCode !in 200..299) {
        throw IOException("Download failed (HTTP ${connection.responseCode})")
      }
      val total = connection.contentLengthLong
      var done = 0L
      var lastReported = -1
      connection.inputStream.use { input ->
        FileOutputStream(dest).use { output ->
          val buffer = ByteArray(64 * 1024)
          while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            output.write(buffer, 0, read)
            done += read
            if (total > 0) {
              val percent = ((done * 100) / total).toInt()
              if (percent != lastReported) {
                lastReported = percent
                onProgress(percent / 100.0)
              }
            }
          }
        }
      }
    } finally {
      connection.disconnect()
    }
  }

  private fun unzip(zip: File, target: File) {
    val targetPath = target.canonicalPath + File.separator
    ZipInputStream(zip.inputStream().buffered()).use { zis ->
      while (true) {
        val entry = zis.nextEntry ?: break
        val out = File(target, entry.name)
        // Refuse entries that would escape the target folder ("zip slip").
        if (!out.canonicalPath.startsWith(targetPath)) throw IOException("Bad zip entry: ${entry.name}")
        if (entry.isDirectory) {
          out.mkdirs()
        } else {
          out.parentFile?.mkdirs()
          FileOutputStream(out).use { zis.copyTo(it) }
        }
        zis.closeEntry()
      }
    }
  }

  /**
   * Picks the wake phrase. Vosk silently ignores words missing from the model's
   * vocabulary, so check graph/words.txt when the model has one.
   */
  fun choosePhrase(dir: File): String {
    val wordsFile = File(dir, "graph/words.txt")
    if (!wordsFile.exists()) return PHRASES.first()
    val vocabulary = HashSet<String>()
    wordsFile.forEachLine { line -> line.substringBefore(' ').takeIf { it.isNotEmpty() }?.let(vocabulary::add) }
    return PHRASES.firstOrNull { phrase -> phrase.split(' ').all { it in vocabulary } } ?: PHRASES.first()
  }
}
