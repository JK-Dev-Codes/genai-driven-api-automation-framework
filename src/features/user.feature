Feature: <Your Feature Name>

  # Add your scenarios below
  # Example:
  #
  # Scenario: <Scenario name>
  #   Given the API base URL is configured
  #   When I send a "GET" request to "/<your-endpoint>"
  #   Then the response status should be 200
  #   And the response body should not be empty
      }
      """
    Then the response status should be 200

  Scenario: Delete a user
    Given the API base URL is configured
    When I send a "DELETE" request to "/users/1"
    Then the response status should be 200
