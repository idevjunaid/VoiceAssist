<?php

namespace Drupal\voice_assist\Controller;

use Drupal\Core\Controller\ControllerBase;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Drupal\voice_assist\Service\AiRequester;
use Symfony\Component\DependencyInjection\ContainerInterface;

class AIProxyController extends ControllerBase
{

  protected AiRequester $aiRequester;

  public function __construct(AiRequester $aiRequester)
  {
    $this->aiRequester = $aiRequester;
  }

  public static function create(ContainerInterface $container)
  {
    return new static(
      $container->get('voice_assist.ai_requester')
    );
  }

  public function process(Request $request): JsonResponse
  {
    $data = json_decode($request->getContent(), TRUE);

    $label = trim($data['label'] ?? '');
    $value = trim($data['value'] ?? '');
    $mode = trim($data['mode'] ?? 'question'); // question or interpret
    $content_type = trim($data['contentType'] ?? '');

    if (empty($label)) {
      return new JsonResponse(['error' => 'Label is required.'], 400);
    }

    if ($mode === 'question') {
      $prompt = <<<EOT
You are a UX assistant helping users fill out a "$content_type" form.

Convert the following form field label into a clear, natural-sounding question, as if you are interviewing the user for this type of content.

Label: "$label"

Guidelines:
- Consider the context of "$content_type" when forming the question.
- Be polite, concise, and professional.
- Avoid repeating the label verbatim unless necessary for clarity.
- Ensure the question clearly reflects the expected data type and context.
- Make it easy for a general audience to answer.

Examples:
- For content type "Business Listing" and label "Business Name" → "What is the name of your business?"
- For content type "Event" and label "Start Date" → "When will the event start?"

Now convert the label "$label" into a user-friendly question suitable for "$content_type".
EOT;
    } elseif ($mode === 'interpret' && !empty($value)) {
      $prompt = <<<EOT
You are an intelligent input parser. Convert the user's spoken response:

"$value"

Into a clean, concise, and valid value that fits the form field labeled:

"$label"

Only return the interpreted value. Do not include any explanation or context.
EOT;
    } else {
      return new JsonResponse(['error' => 'Invalid or missing value for interpretation.'], 400);
    }

    $response = $this->aiRequester->ask($prompt);
    return new JsonResponse(['response' => $response]);
  }
}
