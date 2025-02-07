import mongoose, {isValidObjectId} from "mongoose"
import { Comment } from "../models/comment.models.js"
import { asyncHandler } from "../utils/asynchandler.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"

const addComment = asyncHandler( async (req, res) => {
    const { videoId } = req.params
    
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid location")    
    }

    const { content } = req.body
    if (!content) {
        throw new ApiError(400, "Write something for comment")
    }
    
    const comment = await Comment.create({
      content,
      video: videoId,
      owner: req.user?._id
    });

    
    const createdComment = await Comment.findById(comment._id)
    if (!createdComment) {
        throw new ApiError(500, "Something went wrong while uploading the comment")
    }
    

    return res.status(200).json( new ApiResponse(200, createdComment, "Comment added successfully"))

})

const getVideoComments  = asyncHandler( async (req, res) => {
    const { videoId } = req.params
    
    const {page = 1, limit = 10} = req.query

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid location");
    }

    const aggregateComments = Comment.aggregate([
      {
        $match: {
          video: new mongoose.Types.ObjectId(videoId),
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "owner",
          foreignField: "_id",
          as: "owner",
          pipeline: [
            {
              $project: {
                username: 1,
                avatar: 1
              },
            },
          ],
        },
      },
      {
        $addFields: {
            owner: {
                $first: "$owner"
            }
        }
      }
    ]);

//pagination
    const pageNumber = parseInt(page, 10)
    const limitNumber = parseInt(limit, 10)

    const options = {
        page: pageNumber,
        limit: limitNumber
    }
    
    const comments = await Comment.aggregatePaginate(aggregateComments, options)
    
    if (comments.totalDocs === 0) {
      throw new ApiError(404, "No comments found")
    }

    return res.status(200).json( new ApiResponse(200, comments.docs, "Comments fetched successfully"))



})

const updateComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  
  if (!isValidObjectId(commentId)) {
    throw new ApiError(400, "Invalid location");
  }

  const comment = await Comment.findById(commentId)

  if (!comment) {
    throw new ApiError(404, "No comment found")
  }

  if (comment?.owner.toString() !== req.user?._id.toString()) {
    throw new ApiError(401, "Only owner can update the comment")
  }

  const { content } = req.body
  if (!content) {
    throw new ApiError(400, "write something for updation");
  }

  const updatedComment = await Comment.findByIdAndUpdate(
    commentId, 
    {
      $set: {
        content
      }
    },
    {new: true}
  )

  if (!updatedComment) {
    throw new ApiError(500, "Error during updating the comment")
  }

  return res.status(200).json( new ApiResponse(200, updatedComment, "Comment updated successfully"))


})

const deleteComment = asyncHandler( async (req, res) => {
  const { commentId } = req.params;
  if (!isValidObjectId(commentId)) {
    throw new ApiError(400, "Invalid location");
  }

  const comment = await Comment.findById(commentId);

  if (!comment) {
    throw new ApiError(404, "No comment found");
  }

  if (comment?.owner.toString() !== req.user?._id.toString()) {
    throw new ApiError(401, "Only owner can delete the comment");
  }

  await Comment.findByIdAndDelete(commentId)

  return res.status(200).json( new ApiResponse(200, {}, "Commented deleted successfully"))



})


export { addComment, getVideoComments, updateComment, deleteComment };