import { Router } from "express";
import {
  addComment,
  getVideoComments,
  updateComment,
  deleteComment,
} from "../controllers/comment.controller.js";
import { verifyJWT } from "../middlewares/auth.middlewares.js";

const router = Router()
router.use(verifyJWT)


router.route("/:videoId").post(addComment).get(getVideoComments);
router.route("/c/:commentId").patch(updateComment).delete(deleteComment);





export default router