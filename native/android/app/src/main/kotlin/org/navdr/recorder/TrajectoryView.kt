package org.navdr.recorder

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.view.View
import org.navdr.core.GeoPoint
import java.util.ArrayDeque
import kotlin.math.*

/** Offline trajectory preview, not a street map or reference/accuracy plot. Bounded to 1,200 points. */
class TrajectoryView(context: Context) : View(context) {
    private val points = ArrayDeque<GeoPoint>()
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val path = Path()
    private val east = DoubleArray(1200)
    private val north = DoubleArray(1200)
    private var valid = false
    init { contentDescription = "Estimated trajectory preview; no reference or street map" }
    fun reset() { points.clear(); invalidate() }
    fun update(position: GeoPoint?, available: Boolean) {
        valid = available
        if (position != null && points.peekLast() != position) {
            points.addLast(position)
            if (points.size > 1200) points.removeFirst()
        }
        invalidate()
    }
    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        canvas.drawColor(Color.rgb(18, 32, 43))
        val density = resources.displayMetrics.density
        val pad = 22f * density
        paint.color = Color.rgb(35, 54, 65); paint.strokeWidth = density
        for (i in 1..4) {
            canvas.drawLine(width * i / 5f, 0f, width * i / 5f, height.toFloat(), paint)
            canvas.drawLine(0f, height * i / 5f, width.toFloat(), height * i / 5f, paint)
        }
        paint.color = Color.rgb(170, 193, 203); paint.textSize = 12f * density
        canvas.drawText("N ↑   ESTIMATED PATH", pad, pad, paint)
        if (points.isEmpty()) {
            canvas.drawText("Path appears after moving GNSS initialization", pad, height / 2f, paint)
            return
        }
        val origin = points.first
        val longitudeScale = 111194.9 * cos(Math.toRadians(origin.lat))
        var count = 0
        var minX = Double.POSITIVE_INFINITY; var maxX = Double.NEGATIVE_INFINITY
        var minY = Double.POSITIVE_INFINITY; var maxY = Double.NEGATIVE_INFINITY
        for (p in points) {
            val x = (p.lon - origin.lon) * longitudeScale
            val y = (p.lat - origin.lat) * 111194.9
            east[count] = x; north[count] = y; count++
            minX = min(minX, x); maxX = max(maxX, x)
            minY = min(minY, y); maxY = max(maxY, y)
        }
        val spanX = max(20.0, maxX - minX); val spanY = max(20.0, maxY - minY)
        val scale = min((width - pad * 2) / spanX, (height - pad * 4) / spanY)
        fun x(index: Int) = (width / 2 + (east[index] - (minX + maxX) / 2) * scale).toFloat()
        fun y(index: Int) = (height / 2 - (north[index] - (minY + maxY) / 2) * scale).toFloat()
        path.rewind()
        for (index in 0 until count) {
            if (index == 0) path.moveTo(x(index), y(index)) else path.lineTo(x(index), y(index))
        }
        paint.color = if (valid) Color.rgb(98, 229, 191) else Color.rgb(124, 141, 151)
        paint.style = Paint.Style.STROKE; paint.strokeWidth = 2.5f * density
        canvas.drawPath(path, paint)
        paint.style = Paint.Style.FILL
        canvas.drawCircle(x(count - 1), y(count - 1), 5f * density, paint)
        paint.color = Color.rgb(170, 193, 203)
        canvas.drawText("Visible span ~${max(spanX, spanY).toInt()} m · ${if (valid) "live estimate" else "last path"}",
            pad, height - pad / 2, paint)
    }
}
