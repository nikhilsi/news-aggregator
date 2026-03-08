package com.nikhilsi.clearnews.ui.reader

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.HorizontalDivider
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.OpenInBrowser
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade
import com.nikhilsi.clearnews.util.relativeTimeString
import com.nikhilsi.clearnews.util.shareArticle
import com.nikhilsi.clearnews.viewmodel.ClearNewsViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReaderScreen(
    viewModel: ClearNewsViewModel,
    modifier: Modifier = Modifier,
) {
    val article by viewModel.selectedArticle.collectAsState()
    val readerContent by viewModel.readerContent.collectAsState()
    val isLoading by viewModel.isReaderLoading.collectAsState()
    val error by viewModel.readerError.collectAsState()
    val fontScale by viewModel.settings.readerFontScale.collectAsState()
    val appearance by viewModel.settings.appearance.collectAsState()

    val currentArticle = article ?: return
    val context = LocalContext.current
    val isDark = when (appearance) {
        "dark" -> true
        "light" -> false
        else -> isSystemInDarkTheme()
    }

    Column(modifier = modifier.fillMaxSize()) {
        // Top bar
        TopAppBar(
            title = { },
            navigationIcon = {
                IconButton(onClick = { viewModel.closeReader() }) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Close reader",
                    )
                }
            },
            actions = {
                IconButton(onClick = { shareArticle(context, currentArticle) }) {
                    Icon(Icons.Default.Share, contentDescription = "Share article")
                }
                IconButton(onClick = {
                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(currentArticle.url)))
                }) {
                    Icon(Icons.Default.OpenInBrowser, contentDescription = "Open original")
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(
                containerColor = MaterialTheme.colorScheme.background,
            ),
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
        ) {
            // Hero image
            val imageUrl = readerContent?.imageUrl ?: currentArticle.imageUrl
            if (imageUrl != null) {
                AsyncImage(
                    model = ImageRequest.Builder(context)
                        .data(imageUrl)
                        .crossfade(true)
                        .build(),
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(250.dp),
                )
            }

            Column(modifier = Modifier.padding(16.dp)) {
                // Title
                Text(
                    text = readerContent?.title ?: currentArticle.title,
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onBackground,
                )

                Spacer(modifier = Modifier.height(16.dp))

                // Metadata line
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = readerContent?.sourceName ?: currentArticle.sourceName,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )

                    val author = readerContent?.author
                    if (author != null) {
                        Text("·", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelSmall)
                        Text(author, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }

                    val timeStr = relativeTimeString(currentArticle.publishedAt)
                    if (timeStr.isNotEmpty()) {
                        Text("·", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelSmall)
                        Text(timeStr, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }

                    val readTime = readerContent?.estimatedReadTime
                    if (readTime != null && readTime > 0) {
                        Text("·", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelSmall)
                        Text("$readTime min read", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Divider
                HorizontalDivider()

                Spacer(modifier = Modifier.height(16.dp))

                // Content area
                when {
                    isLoading -> ReaderSkeleton()
                    error != null -> ReaderError(
                        message = error!!,
                        onRetry = { viewModel.retryReader() },
                    )
                    readerContent?.isFailed == true -> ReaderFailed(
                        sourceName = currentArticle.sourceName,
                        articleUrl = currentArticle.url,
                    )
                    readerContent?.isOk == true && readerContent?.contentHtml != null -> {
                        ReaderWebContent(
                            html = readerContent!!.contentHtml!!,
                            fontScale = fontScale,
                            isDark = isDark,
                        )
                    }
                }
            }
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun ReaderWebContent(
    html: String,
    fontScale: Float,
    isDark: Boolean,
) {
    var webViewHeight by remember { mutableIntStateOf(300) }
    val bgColor = MaterialTheme.colorScheme.background.toArgb()

    AndroidView(
        factory = { ctx ->
            WebView(ctx).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = false
                settings.allowFileAccess = false
                setBackgroundColor(bgColor)

                addJavascriptInterface(object {
                    @JavascriptInterface
                    fun reportHeight(height: Int) {
                        val density = ctx.resources.displayMetrics.density
                        webViewHeight = (height * density).toInt()
                    }
                }, "AndroidBridge")

                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(
                        view: WebView?,
                        request: WebResourceRequest?,
                    ): Boolean {
                        request?.url?.let { url ->
                            ctx.startActivity(Intent(Intent.ACTION_VIEW, url))
                        }
                        return true
                    }
                }
            }
        },
        update = { webView ->
            webView.setBackgroundColor(bgColor)
            webView.loadDataWithBaseURL(
                null,
                wrapReaderHtml(html, fontScale, isDark),
                "text/html",
                "UTF-8",
                null,
            )
        },
        modifier = Modifier
            .fillMaxWidth()
            .height(with(androidx.compose.ui.platform.LocalDensity.current) {
                webViewHeight.toDp()
            }),
    )
}

private fun wrapReaderHtml(content: String, fontScale: Float, isDark: Boolean): String {
    val fontSize = (17 * fontScale).toInt()
    val textColor = if (isDark) "#e5e5e5" else "#1a1a1a"
    val linkColor = if (isDark) "#60a5fa" else "#2563eb"
    val blockquoteBorder = if (isDark) "#4b5563" else "#d1d5db"
    val blockquoteText = if (isDark) "#9ca3af" else "#6b7280"
    val codeBg = if (isDark) "#1f2937" else "#f3f4f6"

    return """
        <!DOCTYPE html>
        <html lang="en">
        <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
        <style>
            body {
                font-family: sans-serif;
                font-size: ${fontSize}px;
                line-height: 1.7;
                color: $textColor;
                background: transparent;
                margin: 0;
                padding: 0;
                word-wrap: break-word;
            }
            img {
                max-width: 100%;
                height: auto;
                border-radius: 8px;
                margin: 16px 0;
            }
            a { color: $linkColor; text-decoration: none; }
            h1, h2, h3, h4 {
                line-height: 1.3;
                margin-top: 24px;
                margin-bottom: 8px;
            }
            p { margin: 0 0 16px 0; }
            blockquote {
                border-left: 3px solid $blockquoteBorder;
                margin: 16px 0;
                padding: 8px 16px;
                color: $blockquoteText;
            }
            pre, code {
                font-size: 14px;
                background: $codeBg;
                border-radius: 4px;
            }
            code { padding: 2px 4px; }
            pre { padding: 12px; overflow-x: auto; }
            pre code { padding: 0; background: none; }
        </style>
        </head>
        <body>
        $content
        <script>
            function reportHeight() {
                AndroidBridge.reportHeight(document.body.scrollHeight);
            }
            window.addEventListener('load', function() {
                setTimeout(reportHeight, 100);
            });
            new ResizeObserver(reportHeight).observe(document.body);
        </script>
        </body>
        </html>
    """.trimIndent()
}

@Composable
private fun ReaderSkeleton() {
    val shimmerColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f)
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        repeat(6) { i ->
            val boxWidth = if (i == 2 || i == 5) 200.dp else 300.dp
            Box(
                modifier = Modifier
                    .width(boxWidth)
                    .height(14.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(shimmerColor),
            )
        }
    }
}

@Composable
private fun ReaderError(
    message: String,
    onRetry: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(16.dp))
        Button(onClick = onRetry) {
            Text("Retry")
        }
    }
}

@Composable
private fun ReaderFailed(
    sourceName: String,
    articleUrl: String,
) {
    val context = LocalContext.current

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "This article couldn't be loaded in reader view.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(16.dp))
        Button(
            onClick = {
                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(articleUrl)))
            },
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.primary,
            ),
        ) {
            Text("Read on $sourceName")
            Spacer(modifier = Modifier.width(4.dp))
            Icon(
                imageVector = Icons.Default.OpenInBrowser,
                contentDescription = null,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}
