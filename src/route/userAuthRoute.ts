import express from "express";
import {
  userLogIn,
  userLogout,
  userProfile,
  userRegister,
} from "../controllers/userCtrl/userAuthCtrl";
import { userAuthentication, userAuthorization } from "../middi/userAuth";
import {
  chat,
  getAllHistory,
  getDocumentById,
  getSessionMessages,
  getUserDocuments,
  uploadPdf,
} from "../controllers/userCtrl/talkWithPdfApi";

const router = express.Router();

router.route("/user/register").post(userRegister);
router.route("/user/logIn").post(userLogIn);
router
  .route("/user/logOut")
  .post(userAuthentication, userAuthorization, userLogout);
router
  .route("/user/profile")
  .get(userAuthentication, userAuthorization, userProfile);

router
  .route("/user/uploadFile")
  .post(userAuthentication, userAuthorization, uploadPdf);

router.route("/user/chat").post(userAuthentication, userAuthorization, chat);

router
  .route("/user/allDocs")
  .get(userAuthentication, userAuthorization, getUserDocuments);

router
  .route("/user/singleDoc/:docId")
  .get(userAuthentication, userAuthorization, getDocumentById);

router
  .route("/user/chatHistory")
  .get(userAuthentication, userAuthorization, getAllHistory);

router
  .route("/user/singleChat/:chatId")
  .get(userAuthentication, userAuthorization, getSessionMessages);

export default router;
