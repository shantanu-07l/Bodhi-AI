import { body, validationResult } from "express-validator";

export const signupValidation = [

    body("username")
        .trim()
        .isLength({ min: 3, max: 20 })
        .withMessage("Username must be between 3 and 20 characters"),

    body("email")
        .trim()
        .isEmail()
        .normalizeEmail()
        .withMessage("Invalid email"),

    body("password")
        .isLength({ min: 8 })
        .matches(/[A-Z]/)
        .matches(/[a-z]/)
        .matches(/[0-9]/)
        .matches(/[!@#$%^&*]/)
        .withMessage(
            "Password must contain uppercase, lowercase, number and special character"
        ),

    (req, res, next) => {

        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.status(400).json({
                errors: errors.array(),
            });
        }

        next();
    },
];

export const loginValidation = [

    body("email")
        .trim()
        .isEmail()
        .normalizeEmail(),

    body("password")
        .notEmpty(),

    (req, res, next) => {

        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.status(400).json({
                errors: errors.array(),
            });
        }

        next();
    },
];