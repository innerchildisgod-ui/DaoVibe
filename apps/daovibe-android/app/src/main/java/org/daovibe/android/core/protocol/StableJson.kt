package org.daovibe.android.core.protocol

import java.math.BigDecimal
import java.nio.charset.StandardCharsets
import java.security.MessageDigest

object StableJson {
    fun stringify(value: Any?): String {
        return when (value) {
            null -> "null"
            is PacketPayload -> stringify(value.toStableMap())
            is String -> quote(value)
            is Boolean -> if (value) "true" else "false"
            is Number -> stringifyNumber(value)
            is Map<*, *> -> stringifyMap(value)
            is Iterable<*> -> value.joinToString(prefix = "[", postfix = "]", separator = ",") {
                stringify(it)
            }
            is Array<*> -> value.joinToString(prefix = "[", postfix = "]", separator = ",") {
                stringify(it)
            }
            else -> quote(value.toString())
        }
    }

    private fun stringifyMap(value: Map<*, *>): String {
        val keys = value.keys
            .filterIsInstance<String>()
            .sorted()

        return keys.joinToString(prefix = "{", postfix = "}", separator = ",") { key ->
            "${quote(key)}:${stringify(value[key])}"
        }
    }

    private fun stringifyNumber(value: Number): String {
        return when (value) {
            is Double -> stringifyFloatingPoint(value)
            is Float -> stringifyFloatingPoint(value.toDouble())
            else -> value.toString()
        }
    }

    private fun stringifyFloatingPoint(value: Double): String {
        if (!value.isFinite()) return "null"

        val normalized = BigDecimal.valueOf(value).stripTrailingZeros()
        return if (normalized.scale() < 0) {
            normalized.setScale(0).toPlainString()
        } else {
            normalized.toPlainString()
        }
    }

    private fun quote(value: String): String {
        val builder = StringBuilder(value.length + 2)
        builder.append('"')

        for (char in value) {
            when (char) {
                '"' -> builder.append("\\\"")
                '\\' -> builder.append("\\\\")
                '\b' -> builder.append("\\b")
                '\u000C' -> builder.append("\\f")
                '\n' -> builder.append("\\n")
                '\r' -> builder.append("\\r")
                '\t' -> builder.append("\\t")
                else -> {
                    if (char.code < 0x20) {
                        builder.append("\\u")
                        builder.append(char.code.toString(16).padStart(4, '0'))
                    } else {
                        builder.append(char)
                    }
                }
            }
        }

        builder.append('"')
        return builder.toString()
    }
}

fun sha256(input: String): String {
    val digest = MessageDigest.getInstance("SHA-256")
        .digest(input.toByteArray(StandardCharsets.UTF_8))

    return digest.joinToString(separator = "") { byte ->
        "%02x".format(byte)
    }
}

