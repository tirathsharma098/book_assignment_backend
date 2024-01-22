import httpStatus from "http-status";
import { USER_TYPE } from "../../utils/constants.js";
import { sendResponse } from "../../utils/sendResponse.js";

export function validateSuperAdmin (req, res, next){
    // console.log(">>> curr user : ", req.currentUser)
    if(req.currentUser.user_type === USER_TYPE.SUPER_ADMIN)
    return next();
    return sendResponse(
        res,
        {},
        "You not have access to this route",
        false,
        httpStatus.OK
    ); 
}