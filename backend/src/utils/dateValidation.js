/**
 * Joi custom validator that rejects dates strictly BEFORE today, while
 * allowing today itself.
 *
 * Joi's built-in `.min("now")` compares against the current instant, so a
 * date-only string like "2026-08-13" (parsed at midnight) is wrongly treated
 * as being in the past on the day itself. This helper compares at the date
 * level instead, and reconstructs a local midnight from the UTC date parts so
 * the result matches the frontend's date picker regardless of timezone.
 */
export const notPastDate = (value, helpers) => {
    const d = new Date(value);
    const selected = new Date(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        d.getUTCDate(),
        0,
        0,
        0,
        0
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selected < today) return helpers.error("date.min");
    return value;
};

/**
 * Mirror of notPastDate for the upper bound: rejects dates strictly AFTER
 * today (date-level), allowing today itself and any timestamp of today.
 */
export const notFutureDate = (value, helpers) => {
    const d = new Date(value);
    const selected = new Date(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        d.getUTCDate(),
        0,
        0,
        0,
        0
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selected > today) return helpers.error("date.max");
    return value;
};
