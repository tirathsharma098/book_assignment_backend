import User from "../../db/models/user.js";
import {
    AUTH_LOG_TYPE,
    CONTROLLER,
    REGEX_EMAIL,
    REGEX_MOBILE,
    REGEX_USERNAME,
    USER_STATUS,
    USER_TYPE,
    VALIDATOR,
} from "../../utils/constants.js";
import { getGeolocationInfo } from "./get-geo-ip.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { getJWTToken } from "../../utils/jwt.helper.js";
import Token from "../../db/models/token.js";
import { addAuthLogs } from "./authLog.js";
import { celebrate, Joi } from "celebrate";
import bcrypt from "bcrypt";
import moment from "moment";
import httpStatus from "http-status";

const userLogin = {
    [VALIDATOR]: celebrate({
        body: Joi.object()
            .keys({
                username: Joi.string().min(4).max(100).required(),
                password: Joi.string().min(8).max(70).required(),
            })
            .required(),
    }),
    [CONTROLLER]: async (req, res) => {
        const { password, username } = req.body;
        const gotUser = await User.findOne({
            $or: [{ email: username }, { username }],
        });
        // If user not found save auth log and send false
        if (!gotUser) {
            req.auth_log_data = {
                type: AUTH_LOG_TYPE.INVALID_EMAIL,
                username,
                email: username,
                device_ip: req?.ip,
                success: false,
                message: "User entered wrong email or username",
                browser_info: `${getGeolocationInfo(req)}`,
            };
            await addAuthLogs.controller(req);
            return sendResponse(
                res,
                {},
                "Email, Username or Password is Incorrect",
                false,
                httpStatus.OK
            );
        }

        // if password not match return user
        const isMatch = await bcrypt.compare(password, gotUser.password);
        if (!isMatch) {
            req.auth_log_data = {
                authLogUser: gotUser,
                type: AUTH_LOG_TYPE.WRONG_PASSWORD,
                username,
                email: username,
                device_ip: req?.ip,
                success: false,
                message: "User entered wrong password",
                browser_info: `${getGeolocationInfo(req)}`,
            };
            await addAuthLogs.controller(req);
            return sendResponse(
                res,
                {},
                "Email, Username or Password is Incorrect",
                false,
                httpStatus.OK
            );
        }
        // check if user is not verified or inactive
        if (gotUser.status !== USER_STATUS.ACTIVE) {
            req.auth_log_data = {
                authLogUser: gotUser,
                type: AUTH_LOG_TYPE.LOGIN,
                username,
                email: username,
                device_ip: req?.ip,
                success: false,
                message:
                    "User is not active but entered correct password and email",
                browser_info: `${getGeolocationInfo(req)}`,
            };
            await addAuthLogs.controller(req);
            return sendResponse(
                res,
                {},
                "Your account is not active",
                false,
                httpStatus.OK
            );
        }
        // creating jwt token for user auth
        const tokenGot = getJWTToken({
            id: gotUser._id,
        });
        const expiryDate = moment(new Date(), "YYYY-MM-DD")
            .add(30, "days")
            .toString();
        // adding created token into token table to validate token
        const newTokenData = {
            user: gotUser,
            valid_till: expiryDate,
            token: tokenGot,
        };
        const tokenDataCreated = new Token(newTokenData);
        await tokenDataCreated.save();
        // Adding auth logs for successfully logged in
        req.auth_log_data = {
            authLogUser: gotUser,
            type: AUTH_LOG_TYPE.LOGIN,
            username,
            email: username,
            device_ip: req.ip,
            success: true,
            message: "User logged in successfully",
            browser_info: `${getGeolocationInfo(req)}`,
        };
        await addAuthLogs.controller(req);
        const userToSend = {
            id: gotUser.id,
            token: tokenGot,
            full_name: gotUser.full_name,
            user_type: gotUser.user_type,
        };
        return sendResponse(
            res,
            userToSend,
            "User LoggedIn successfully",
            true,
            httpStatus.OK
        );
    },
};

const addNewUser = {
    [VALIDATOR]: celebrate({
        body: Joi.object()
            .keys({
                full_name: Joi.string()
                    .required()
                    .label("Full Name")
                    .messages({ "*": "Please enter Full Name" }),
                username: Joi.string()
                    .regex(REGEX_USERNAME)
                    .required()
                    .messages({
                        "*": "Please enter Username of {full_name}",
                    }),
                password: Joi.string().min(8).max(70).required(),
                email: Joi.string()
                    .email()
                    .regex(REGEX_EMAIL)
                    .allow("")
                    .messages({
                        "*": "Please enter valid email of {full_name}",
                    }),
                mobile: Joi.string().length(10).pattern(REGEX_MOBILE),
                user_type: Joi.string()
                    .valid(USER_TYPE.ADMIN, USER_TYPE.CUSTOMER)
                    .required()
                    .messages({
                        "*": "Please tell User Type of {full_name}",
                    }),
            })
            .required(),
    }),
    [CONTROLLER]: async (req, res) => {
        const { full_name, username, email, user_type, mobile, password } =
            req.body;
        const gotUser = await User.findOne({
            $or: [{ email }, { username }, { mobile }],
        });
        if (gotUser)
            return sendResponse(
                res,
                {},
                "User already exist",
                false,
                httpStatus.OK
            );
        const encryptedPassword = await bcrypt.hash(password, 12);
        const newUser = new User({
            full_name,
            username,
            email,
            user_type,
            mobile,
            password: encryptedPassword,
        });
        await newUser.save();
        return sendResponse(
            res,
            {},
            "User added successfully",
            true,
            httpStatus.OK
        );
    },
};

const userList = {
    [VALIDATOR]: celebrate({
        query: Joi.object()
            .keys({
                search_term: Joi.string().allow("", null),
                sort_field: Joi.string().trim().allow(null, ""),
                sort_order: Joi.string().valid("ASC", "DESC").allow(""),
                per_page: Joi.number().integer().min(1).required(),
                page_number: Joi.number().integer().min(1).required(),
            })
            .required(),
    }),
    [CONTROLLER]: async (req, res) => {
        const { search_term, per_page, sort_field, sort_order, page_number } =
            req.query;
        const aggregate = User.aggregate([
            // {
            //     $match: {
            //         $or: [
            //             { full_name: search_term },
            //             { email: search_term },
            //             { mobile: search_term },
            //             { username: search_term },
            //         ],
            //     },
            // },
            {$sort: {'order_number' : -1}},
            {
                $skip:
                    Number(per_page) *
                    (Number(page_number) - 1),
            },
            { $limit: per_page },
        ]);

        const foundData = await aggregate.exec();
        console.log(">>> DATA GOT : ", foundData);
        return sendResponse(
            res,
            foundData,
            "User list got successfully",
            true,
            httpStatus.OK
        );
    },
};

export { userLogin, addNewUser, userList };