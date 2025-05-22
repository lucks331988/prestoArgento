// src/main/utils.js
const { DateTime } = require('luxon');

/**
 * Formats an ISO date string to a specified format.
 * @param {string} isoDate - The ISO date string (e.g., "2023-10-26").
 * @param {string} format - The desired format string (e.g., "dd/MM/yyyy").
 * @returns {string} The formatted date string, or 'N/A' if input is invalid.
 */
function formatDate(isoDate, format = 'dd/MM/yyyy') {
    if (!isoDate) return 'N/A';
    try {
        const dt = DateTime.fromISO(isoDate);
        return dt.isValid ? dt.toFormat(format) : 'Fecha Inválida';
    } catch (error) {
        console.warn(`Error formatting date ${isoDate}:`, error);
        return 'Error Fecha';
    }
}

/**
 * Formats an ISO date-time string to a specified format.
 * @param {string} isoDateTime - The ISO date-time string (e.g., "2023-10-26T14:30:00").
 * @param {string} format - The desired format string (e.g., "dd/MM/yyyy HH:mm:ss").
 * @returns {string} The formatted date-time string, or 'N/A' if input is invalid.
 */
function formatDateTime(isoDateTime, format = 'dd/MM/yyyy HH:mm:ss') {
    if (!isoDateTime) return 'N/A';
    try {
        const dt = DateTime.fromISO(isoDateTime);
        return dt.isValid ? dt.toFormat(format) : 'Fecha/Hora Inválida';
    } catch (error) {
        console.warn(`Error formatting datetime ${isoDateTime}:`, error);
        return 'Error Fecha/Hora';
    }
}

/**
 * Gets the current date and time as an ISO string.
 * @returns {string} The current date-time in ISO format.
 */
function getCurrentDateTimeISO() {
    return DateTime.now().toISO();
}

/**
 * Adds or subtracts days from an ISO date string.
 * @param {string} isoDate - The base ISO date string.
 * @param {number} days - The number of days to add (positive) or subtract (negative).
 * @param {string} operation - 'plus' to add, 'minus' to subtract.
 * @returns {string|null} The new ISO date string, or null if input is invalid.
 */
function addOrSubtractDaysISO(isoDate, days, operation) {
    if (!isoDate || typeof days !== 'number' || !['plus', 'minus'].includes(operation)) {
        return null;
    }
    try {
        const dt = DateTime.fromISO(isoDate);
        if (!dt.isValid) return null;
        const newDt = operation === 'plus' ? dt.plus({ days }) : dt.minus({ days });
        return newDt.toISODate();
    } catch (error) {
        console.warn(`Error in addOrSubtractDaysISO with date ${isoDate}, days ${days}, op ${operation}:`, error);
        return null;
    }
}

module.exports = {
    formatDate,
    formatDateTime,
    getCurrentDateTimeISO,
    addOrSubtractDaysISO,
};
