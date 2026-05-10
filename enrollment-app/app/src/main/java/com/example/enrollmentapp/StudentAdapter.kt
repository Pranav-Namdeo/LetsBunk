package com.example.enrollmentapp

import android.graphics.Color
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView

class StudentAdapter(
    private val onItemClick: (StudentItem) -> Unit
) : RecyclerView.Adapter<StudentAdapter.ViewHolder>() {

    private var items: List<StudentItem> = emptyList()

    // Avatar background colors cycling through a palette
    private val avatarColors = listOf(
        "#1976D2", "#388E3C", "#7B1FA2", "#F57C00",
        "#0097A7", "#C62828", "#5D4037", "#455A64"
    )

    fun submitList(newItems: List<StudentItem>) {
        items = newItems
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_student, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(items[position], position)
    }

    override fun getItemCount() = items.size

    inner class ViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {

        private val avatarText: TextView   = itemView.findViewById(R.id.avatarText)
        private val studentName: TextView  = itemView.findViewById(R.id.studentName)
        private val enrollmentNo: TextView = itemView.findViewById(R.id.enrollmentNo)
        private val statusBadge: TextView  = itemView.findViewById(R.id.statusBadge)

        fun bind(item: StudentItem, position: Int) {
            // Avatar: first letter of name
            val initial = item.name.firstOrNull()?.uppercaseChar()?.toString() ?: "?"
            avatarText.text = initial

            // Cycle avatar color
            val colorHex = avatarColors[position % avatarColors.size]
            val drawable = avatarText.background.mutate()
            (drawable as? android.graphics.drawable.GradientDrawable)?.setColor(Color.parseColor(colorHex))

            studentName.text  = item.name.ifEmpty { "Unknown" }
            enrollmentNo.text = item.enrollmentNo

            // Badge: "Data Added" (green) or "Add Data" (orange)
            if (item.hasEmbedding) {
                statusBadge.text = "Data Added"
                val badgeDrawable = statusBadge.background.mutate()
                (badgeDrawable as? android.graphics.drawable.GradientDrawable)
                    ?.setColor(Color.parseColor("#388E3C"))
            } else {
                statusBadge.text = "Add Data"
                val badgeDrawable = statusBadge.background.mutate()
                (badgeDrawable as? android.graphics.drawable.GradientDrawable)
                    ?.setColor(Color.parseColor("#FF7043"))
            }

            itemView.setOnClickListener { onItemClick(item) }
        }
    }
}
