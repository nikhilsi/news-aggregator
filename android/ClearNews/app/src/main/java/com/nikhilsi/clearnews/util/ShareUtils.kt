package com.nikhilsi.clearnews.util

import android.content.Context
import android.content.Intent
import com.nikhilsi.clearnews.model.Article
import java.net.URLEncoder

fun shareArticle(context: Context, article: Article) {
    val readerUrl = "https://getclearnews.com/article?url=${URLEncoder.encode(article.url, "UTF-8")}"
    val timeText = relativeTimeString(article.publishedAt)
    val meta = listOfNotNull(
        article.sourceName,
        timeText.ifEmpty { null },
    ).joinToString(" · ")

    val shareText = "${article.title}\n$meta\n\n$readerUrl"

    val sendIntent = Intent(Intent.ACTION_SEND).apply {
        putExtra(Intent.EXTRA_TEXT, shareText)
        putExtra(Intent.EXTRA_SUBJECT, article.title)
        type = "text/plain"
    }
    context.startActivity(Intent.createChooser(sendIntent, "Share article"))
}
