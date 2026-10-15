package expo.modules.pdftext

import android.net.Uri
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.io.MemoryUsageSetting
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.encryption.InvalidPasswordException
import com.tom_roush.pdfbox.text.PDFTextStripper
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Extracts the embedded text of a PDF stored in the app's own storage (spec 10.3).
 *
 * Runs on Dispatchers.IO rather than the shared Expo async-function queue, so a
 * 200-page PDF never blocks database calls, and reports progress every 5 pages.
 * Scanned PDFs (images only) come back with little or no text; JS decides that
 * they need OCR.
 */
class PdfTextModule : Module() {
  @Volatile private var pdfBoxReady = false

  override fun definition() = ModuleDefinition {
    Name("PdfText")

    Events("onProgress")

    AsyncFunction("extractTextAsync") Coroutine { fileUri: String, jobId: String ->
      withContext(Dispatchers.IO) { extract(fileUri, jobId) }
    }
  }

  private fun extract(fileUri: String, jobId: String): Map<String, Any> {
    ensurePdfBox()
    val path = Uri.parse(fileUri).path
      ?: throw CodedException("ERR_PDF_BAD_URI", "Invalid file URI: $fileUri", null)
    val file = File(path)
    if (!file.exists()) {
      throw CodedException("ERR_PDF_NOT_FOUND", "File not found: $path", null)
    }

    val document = try {
      // Temp-file-backed buffering keeps memory flat for very large PDFs.
      PDDocument.load(file, "", MemoryUsageSetting.setupTempFileOnly())
    } catch (e: InvalidPasswordException) {
      throw CodedException("ERR_PDF_PASSWORD", "PDF is password-protected", e)
    } catch (e: Exception) {
      throw CodedException("ERR_PDF_UNREADABLE", "Could not open PDF: ${e.message}", e)
    }

    document.use { doc ->
      val total = doc.numberOfPages
      val stripper = PDFTextStripper()
      val text = StringBuilder()
      for (page in 1..total) {
        stripper.startPage = page
        stripper.endPage = page
        text.append(stripper.getText(doc))
        if (page % 5 == 0 || page == total) {
          sendEvent("onProgress", mapOf("jobId" to jobId, "page" to page, "total" to total))
        }
      }
      return mapOf("text" to text.toString(), "pageCount" to total)
    }
  }

  private fun ensurePdfBox() {
    if (pdfBoxReady) return
    val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    PDFBoxResourceLoader.init(context.applicationContext)
    pdfBoxReady = true
  }
}
