import express from "express";
import {
  userLogIn,
  userLogout,
  userProfile,
  userRegister,
} from "../controllers/userCtrl/userAuthCtrl";
import { userAuthentication, userAuthorization } from "../middi/userAuth";

const router = express.Router();

router.route("/user/register").post(userRegister);
router.route("/user/logIn").post(userLogIn);
router
  .route("/user/logOut")
  .post(userAuthentication, userAuthorization, userLogout);
router
  .route("/user/profile")
  .get(userAuthentication, userAuthorization, userProfile);

export default router;
